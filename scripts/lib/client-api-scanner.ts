import * as fs from 'fs';
import * as path from 'path';
import {
  Project, SyntaxKind, Node, SourceFile,
  MethodDeclaration, FunctionDeclaration, ArrowFunction, CallExpression,
  PropertyAccessExpression,
} from 'ts-morph';
import { ParamInfo, ReturnsInfo, HttpMethod } from './ast-parser';
import { resolveModelParams, preloadSourceFiles } from './model-resolver';
import { traceApiUsage, loadFilesForTracing, ApiUsageChain } from './usage-tracer';
import { ApiTracerConfig } from '../../config';

export interface ClientApiEntry {
  method: HttpMethod;
  url: string;
  description: string;
  params: ParamInfo[];
  returns: ReturnsInfo | null;
  sourceFile: string;
  sourceAbsPath: string;  // import 추적용 절대경로
  sourceLine: number;
  functionName: string;
  group: string;
  usageChain: ApiUsageChain | null;
}

const HTTP_METHODS_MAP: Record<string, HttpMethod> = {
  get: 'GET', post: 'POST', put: 'PUT', delete: 'DELETE', patch: 'PATCH',
};

const project = new Project({
  compilerOptions: { allowJs: true, experimentalDecorators: true },
  skipAddingFilesFromTsConfig: true,
});

function extractUrl(callExpr: CallExpression): string {
  const args = callExpr.getArguments();
  if (args.length === 0) return '';
  const raw = args[0].getText();
  if (raw.startsWith('`')) {
    return raw.slice(1, -1)
      .replace(/\$\{([^}]+)\}/g, (_, inner) => `:${inner.trim().split('.').pop()}`)
      .replace(/^\//, '');
  }
  return raw.replace(/^['"]|['"]$/g, '').replace(/^\//, '');
}

function extractParamTypeName(callExpr: CallExpression): string | null {
  const args = callExpr.getArguments();
  if (args.length < 2) return null;
  try {
    const type = args[1].getType();
    const typeText = type.getText();
    if (typeText.includes('AxiosRequestConfig') || typeText.startsWith('{')) return null;
    const symbol = type.getSymbol() ?? type.getAliasSymbol();
    if (symbol) {
      const name = symbol.getName();
      if (name && name !== '__type' && name !== 'any') return name;
    }
    if (typeText && typeText !== 'any' && !typeText.includes('=>')) {
      return typeText.split('.').pop() ?? null;
    }
  } catch {
    const text = args[1].getText();
    if (/^[a-zA-Z_$][a-zA-Z0-9_.]*$/.test(text)) return text.split('.').pop() ?? null;
  }
  return null;
}

function findContainingFunction(node: Node): MethodDeclaration | FunctionDeclaration | ArrowFunction | null {
  let cur: Node | undefined = node.getParent();
  while (cur) {
    const kind = cur.getKind();
    if (kind === SyntaxKind.MethodDeclaration || kind === SyntaxKind.FunctionDeclaration || kind === SyntaxKind.ArrowFunction) {
      return cur as MethodDeclaration | FunctionDeclaration | ArrowFunction;
    }
    cur = cur.getParent();
  }
  return null;
}

function getFunctionName(fn: MethodDeclaration | FunctionDeclaration | ArrowFunction): string {
  if (fn.getKind() === SyntaxKind.MethodDeclaration) return (fn as MethodDeclaration).getName();
  if (fn.getKind() === SyntaxKind.FunctionDeclaration) return (fn as FunctionDeclaration).getName() ?? 'anonymous';
  const parent = fn.getParent();
  if (parent?.getKind() === SyntaxKind.VariableDeclaration) return (parent as any).getName?.() ?? 'anonymous';
  return 'anonymous';
}

// ─────────────────────────────────────────────
// HTTP 클라이언트 호출 패턴 매칭 (config 기반)
// ─────────────────────────────────────────────
function isHttpClientCall(exprText: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.includes('.')) {
      // "this.http" → exprText가 정확히 "this.http"인지 확인
      return exprText === pattern;
    }
    // "apiClient" → exprText가 "apiClient"인지 확인
    return exprText === pattern;
  });
}

function parseClientFile(
  filePath: string,
  projectRoot: string,
  httpPatterns: string[],
  decoratorConfig: Required<ApiTracerConfig>['decorators']
): ClientApiEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');

  // 파일 내용에 관련 패턴이 하나도 없으면 조기 반환
  const EXTRA_KEYWORDS = ['fetch', '$fetch', 'useFetch', 'useAsyncData', 'useQuery', 'useMutation'];
  const hasAnyPattern =
    httpPatterns.some((p) => content.includes(p.split('.').pop()!)) ||
    EXTRA_KEYWORDS.some((kw) => content.includes(kw));
  if (!hasAnyPattern) return [];

  const sourceFile = project.createSourceFile(filePath, content, { overwrite: true });
  const relativePath = path.relative(projectRoot, filePath);
  const results: ClientApiEntry[] = [];

  sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((callExpr) => {
    const expr = callExpr.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) return;

    const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const methodName = propAccess.getName().toLowerCase();
    const httpMethod = HTTP_METHODS_MAP[methodName];
    if (!httpMethod) return;

    const exprText = propAccess.getExpression().getText();
    if (!isHttpClientCall(exprText, httpPatterns)) return;

    const url = extractUrl(callExpr);
    if (!url) return;

    const containingFn = findContainingFunction(callExpr);
    const functionName = containingFn ? getFunctionName(containingFn) : 'anonymous';

    let params: ParamInfo[] = [];
    const typeName = extractParamTypeName(callExpr);
    if (typeName) {
      try {
        const resolved = resolveModelParams(typeName, decoratorConfig);
        if (resolved.length > 0) params = resolved;
      } catch { /* ignore */ }
    }

    const group = url.replace(/^\//, '').split('/')[0] || 'etc';

    results.push({
      method: httpMethod,
      url: url.startsWith('/') ? url : `/${url}`,
      description: '',
      params,
      returns: null,
      sourceFile: relativePath,
      sourceAbsPath: filePath,  // 절대경로 보존
      sourceLine: callExpr.getStartLineNumber(),
      functionName,
      group,
      usageChain: null,
    });
  });

  // ── fetch() / axios() 직접 호출 감지 ──
  detectDirectFetchCalls(sourceFile, relativePath, filePath, results);

  // ── React Query / TanStack Query 감지 ──
  detectReactQueryCalls(sourceFile, relativePath, filePath, httpPatterns, results);

  // ── Vue useFetch / $fetch 감지 ──
  detectVueFetchCalls(sourceFile, relativePath, filePath, results);

  return results;
}

// ─────────────────────────────────────────────
// fetch() / axios() 직접 호출 감지
// ─────────────────────────────────────────────
function detectDirectFetchCalls(
  sourceFile: SourceFile,
  relativePath: string,
  absPath: string,
  results: ClientApiEntry[]
): void {
  sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((callExpr) => {
    const calleeName = callExpr.getExpression().getText();
    if (calleeName !== 'fetch' && calleeName !== '$fetch') return;

    const args = callExpr.getArguments();
    if (args.length === 0) return;

    const url = extractUrl(callExpr);
    if (!url) return;
    // 내부 API만 (상대경로 또는 /api/ 로 시작)
    const normalizedUrl = url.startsWith('/') ? url : `/${url}`;
    if (!normalizedUrl.startsWith('/api') && !normalizedUrl.startsWith('/')) return;

    let method: HttpMethod = 'GET';
    if (args.length >= 2) {
      const optText = args[1].getText();
      const methodMatch = optText.match(/method\s*:\s*['"](\w+)['"]/i);
      if (methodMatch) method = methodMatch[1].toUpperCase() as HttpMethod;
    }

    const containingFn = findContainingFunction(callExpr);
    const functionName = containingFn ? getFunctionName(containingFn) : 'anonymous';
    const group = normalizedUrl.replace(/^\//, '').split('/')[0] || 'etc';

    results.push({
      method,
      url: normalizedUrl,
      description: '',
      params: [],
      returns: null,
      sourceFile: relativePath,
      sourceAbsPath: absPath,
      sourceLine: callExpr.getStartLineNumber(),
      functionName,
      group,
      usageChain: null,
    });
  });
}

// ─────────────────────────────────────────────
// React Query / TanStack Query 패턴 감지
// useQuery({ queryFn: () => apiClient.get('/api/...') })
// useMutation({ mutationFn: (p) => apiClient.post('/api/...', p) })
// ─────────────────────────────────────────────
function detectReactQueryCalls(
  sourceFile: SourceFile,
  relativePath: string,
  absPath: string,
  httpPatterns: string[],
  results: ClientApiEntry[]
): void {
  sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((callExpr) => {
    const calleeName = callExpr.getExpression().getText();
    if (calleeName !== 'useQuery' && calleeName !== 'useMutation') return;

    const args = callExpr.getArguments();
    if (args.length === 0) return;
    const firstArg = args[0];
    if (firstArg.getKind() !== SyntaxKind.ObjectLiteralExpression) return;

    const obj = firstArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const fnPropName = calleeName === 'useQuery' ? 'queryFn' : 'mutationFn';

    const fnProp = obj.getProperties().find((p) => {
      if (p.getKind() === SyntaxKind.PropertyAssignment) {
        return (p as any).getName?.() === fnPropName;
      }
      return false;
    });
    if (!fnProp) return;

    // fnProp 내부에서 HTTP 호출 추출
    fnProp.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((innerCall) => {
      const innerExpr = innerCall.getExpression();
      if (innerExpr.getKind() !== SyntaxKind.PropertyAccessExpression) return;

      const propAccess = innerExpr as PropertyAccessExpression;
      const methodName = propAccess.getName().toLowerCase();
      const httpMethod = HTTP_METHODS_MAP[methodName];
      if (!httpMethod) return;

      const exprText = propAccess.getExpression().getText();
      if (!isHttpClientCall(exprText, httpPatterns)) return;

      const url = extractUrl(innerCall);
      if (!url) return;

      const containingFn = findContainingFunction(callExpr);
      const functionName = containingFn ? getFunctionName(containingFn) : 'anonymous';
      const normalizedUrl = url.startsWith('/') ? url : `/${url}`;
      const group = normalizedUrl.replace(/^\//, '').split('/')[0] || 'etc';

      results.push({
        method: httpMethod,
        url: normalizedUrl,
        description: '',
        params: [],
        returns: null,
        sourceFile: relativePath,
        sourceAbsPath: absPath,
        sourceLine: innerCall.getStartLineNumber(),
        functionName,
        group,
        usageChain: null,
      });
    });
  });
}

// ─────────────────────────────────────────────
// Vue useFetch / useAsyncData / $fetch 감지
// ─────────────────────────────────────────────
function detectVueFetchCalls(
  sourceFile: SourceFile,
  relativePath: string,
  absPath: string,
  results: ClientApiEntry[]
): void {
  sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((callExpr) => {
    const calleeName = callExpr.getExpression().getText();
    if (calleeName !== 'useFetch' && calleeName !== 'useAsyncData') return;

    const args = callExpr.getArguments();
    if (args.length === 0) return;

    let url = '';
    let method: HttpMethod = 'GET';

    if (calleeName === 'useFetch') {
      url = extractUrl(callExpr);
      // 2번째 인자에서 method 추출
      if (args.length >= 2) {
        const optText = args[1].getText();
        const methodMatch = optText.match(/method\s*:\s*['"](\w+)['"]/i);
        if (methodMatch) method = methodMatch[1].toUpperCase() as HttpMethod;
      }
    } else if (calleeName === 'useAsyncData') {
      // useAsyncData('key', () => $fetch('/api/...'))
      // 2번째 인자(콜백) 내부의 $fetch 호출 탐색
      if (args.length >= 2) {
        const callback = args[1];
        callback.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((innerCall) => {
          const innerName = innerCall.getExpression().getText();
          if (innerName === '$fetch' || innerName === 'fetch') {
            url = extractUrl(innerCall);
          }
        });
      }
    }

    if (!url) return;
    const normalizedUrl = url.startsWith('/') ? url : `/${url}`;
    if (!normalizedUrl.startsWith('/api')) return;

    const containingFn = findContainingFunction(callExpr);
    const functionName = containingFn ? getFunctionName(containingFn) : 'anonymous';
    const group = normalizedUrl.replace(/^\//, '').split('/')[0] || 'etc';

    results.push({
      method,
      url: normalizedUrl,
      description: '',
      params: [],
      returns: null,
      sourceFile: relativePath,
      sourceAbsPath: absPath,
      sourceLine: callExpr.getStartLineNumber(),
      functionName,
      group,
      usageChain: null,
    });
  });
}

function walkDir(dirPath: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dirPath)) return files;
  fs.readdirSync(dirPath, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) files.push(...walkDir(full));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(full);
  });
  return files;
}

// ─────────────────────────────────────────────
// apiDirs glob 패턴 기반 API 파일 탐색
// ─────────────────────────────────────────────
function matchesGlobDir(filePath: string, projectRoot: string, apiDirs: string[]): boolean {
  const relative = path.relative(projectRoot, filePath).replace(/\\/g, '/');
  const dirPart = path.dirname(relative);

  return apiDirs.some((pattern) => {
    // glob의 ** 를 정규식으로 변환
    const regexStr = pattern
      .replace(/\\/g, '/')
      .replace(/\*\*/g, '___GLOBSTAR___')
      .replace(/\*/g, '[^/]*')
      .replace(/___GLOBSTAR___/g, '.*');
    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(dirPart);
  });
}

function findApiFiles(projectRoot: string, apiDirs: string[]): string[] {
  const srcDir = path.join(projectRoot, 'src');
  if (!fs.existsSync(srcDir)) return [];
  const results: string[] = [];

  function walk(dir: string): void {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.api\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        // apiDirs가 기본값이면 모든 *.api.ts 포함 (하위 호환)
        // apiDirs가 커스텀이면 해당 디렉토리 패턴에 매칭되는 파일만 포함
        if (apiDirs.length === 0 || matchesGlobDir(full, projectRoot, apiDirs)) {
          results.push(full);
        }
      }
    });
  }

  walk(srcDir);

  // apiDirs 중 src/ 외부 경로가 있으면 추가 탐색
  apiDirs.forEach((pattern) => {
    if (!pattern.startsWith('src/') && !pattern.startsWith('src\\')) {
      const baseDir = path.join(projectRoot, pattern.split('*')[0]);
      if (fs.existsSync(baseDir)) {
        walkDir(baseDir).forEach((file) => {
          if (/\.api\.(ts|tsx)$/.test(file) && !results.includes(file)) {
            results.push(file);
          }
        });
      }
    }
  });

  return results;
}

// ─────────────────────────────────────────────
// 메인 스캔 함수 (config 전달)
// ─────────────────────────────────────────────
export function scanClientApiCalls(
  projectRoot: string,
  config?: Required<ApiTracerConfig>
): ClientApiEntry[] {
  // config가 없으면 기본값 사용 (하위 호환)
  const httpPatterns = config?.httpClient?.patterns ?? ['this.http', 'this.axios', 'apiClient', 'request'];
  const apiDirs = config?.apiDirs ?? ['src/domain/**/api', 'src/shared/api', 'shared/api'];
  const traceConfig = config?.trace ?? { enabled: true, sharedDirs: ['src/shared', 'shared'] };
  const decoratorConfig = config?.decorators ?? { label: ['Attribute', 'ApiProperty', 'ApiPropertyOptional'], required: ['IsNotEmpty', 'IsNotBlank'] };
  const aliasConfig = config?.alias ?? {};

  // 모델 해석 + 참조 추적 모두를 위해 src 전체 로드
  preloadSourceFiles(projectRoot);
  loadFilesForTracing(projectRoot, aliasConfig, traceConfig.sharedDirs ?? ['src/shared', 'shared']);

  const apiFiles = findApiFiles(projectRoot, apiDirs);
  if (apiFiles.length === 0) {
    console.warn('[api-docs] *.api.ts 파일을 찾지 못했습니다.');
    return [];
  }

  console.log(`[api-docs] *.api.ts 파일 ${apiFiles.length}개 발견`);
  console.log(`[api-docs] HTTP 패턴: ${httpPatterns.join(', ')}`);

  const results: ClientApiEntry[] = [];
  apiFiles.forEach((file) => {
    try {
      const entries = parseClientFile(file, projectRoot, httpPatterns, decoratorConfig);
      if (entries.length > 0) {
        console.log(`[api-docs]   ✓ ${path.relative(projectRoot, file)} → ${entries.length}개 호출`);
        results.push(...entries);
      }
    } catch (err) {
      console.warn(`[api-docs]   ✗ ${path.relative(projectRoot, file)}:`, (err as Error).message);
    }
  });

  const deduped = results.filter(
    (r, i, arr) => arr.findIndex((x) => x.method === r.method && x.url === r.url) === i
  );

  // 역방향 사용처 추적
  if (traceConfig.enabled !== false) {
    console.log('[api-docs] 사용처 추적 중...');
    deduped.forEach((entry, i) => {
      try {
        entry.usageChain = traceApiUsage(entry.functionName, projectRoot, entry.sourceAbsPath);
      } catch (err) {
        console.warn(`[api-docs]   추적 실패 ${entry.functionName}:`, (err as Error).message);
      }
      if ((i + 1) % 10 === 0) {
        console.log(`[api-docs]   ${i + 1}/${deduped.length} 완료`);
      }
    });
  } else {
    console.log('[api-docs] 사용처 추적 비활성화됨 (trace.enabled: false)');
  }

  console.log(`[api-docs] 클라이언트 API → 총 ${deduped.length}개`);
  return deduped.sort((a, b) => a.url.localeCompare(b.url));
}
