import * as fs from 'fs';
import * as path from 'path';

export interface UsageCaller {
  file: string;
  functionName: string;
  isPage: boolean;
}

export interface ApiUsageChain {
  apiFunction: string;
  directCallers: UsageCaller[];  // query 파일
  pageCallers: UsageCaller[];    // query를 직접 import하는 파일
}

// 파일 경로 → 이 파일을 import하는 파일들
type ImportIndex = Map<string, string[]>;
let importIndex: ImportIndex | null = null;
let projectRootCache = '';

// ─────────────────────────────────────────────
// config 캐시 (loadFilesForTracing에서 설정)
// ─────────────────────────────────────────────
let aliasConfig: Record<string, string> = {};
let sharedDirsConfig: string[] = ['src/shared', 'shared'];

// ─────────────────────────────────────────────
// import 경로 resolve (config.alias 기반)
// ─────────────────────────────────────────────
function resolveAlias(importPath: string, fromDir: string, projectRoot: string): string | null {
  let base: string | null = null;

  // 1. 상대 경로
  if (importPath.startsWith('.')) {
    base = path.resolve(fromDir, importPath);
  }
  // 2. config alias 매칭
  else {
    // 외부 패키지 제외 (npm 모듈)
    if (!importPath.startsWith('@') && !importPath.startsWith('~')) {
      // 일반 모듈명 (lodash, react 등) → 무시
      if (!importPath.includes('/') || importPath.startsWith('node_modules')) return null;
    }

    // @tanstack, @types 등 외부 스코프 패키지 제외
    if (importPath.startsWith('@tanstack') || importPath.startsWith('@types')) return null;

    // config alias에서 매칭
    for (const [aliasKey, aliasValue] of Object.entries(aliasConfig)) {
      if (importPath.startsWith(aliasKey)) {
        const remainder = importPath.slice(aliasKey.length);
        base = path.join(projectRoot, aliasValue, remainder);
        break;
      }
    }

    // alias에 없으면 기존 fallback: @/ → src/, @xxx/ → src/xxx/
    if (!base) {
      if (importPath.startsWith('@/')) {
        base = path.join(projectRoot, 'src', importPath.slice(2));
      } else if (importPath.startsWith('@') && !importPath.startsWith('@tanstack') && !importPath.startsWith('@types')) {
        base = path.join(projectRoot, 'src', importPath.slice(1));
      } else {
        return null;
      }
    }
  }

  if (!base) return null;

  const exts = ['.ts', '.tsx', '.js', '.jsx'];
  const suffixes = ['', '/index'];
  for (const s of suffixes) {
    for (const e of exts) {
      const candidate = base + s + e;
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// 파일에서 import하는 경로 목록 추출
// ─────────────────────────────────────────────
function extractImports(content: string, fromFile: string, projectRoot: string): string[] {
  const dir = path.dirname(fromFile);
  const results: string[] = [];
  const pattern = /from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    const resolved = resolveAlias(m[1], dir, projectRoot);
    if (resolved) results.push(resolved);
  }
  return results;
}

// ─────────────────────────────────────────────
// import 역방향 인덱스 빌드
// ─────────────────────────────────────────────
export function buildCallIndex(projectRoot: string): void {
  if (importIndex !== null && projectRootCache === projectRoot) return;

  console.log('[api-docs] import 인덱스 빌드 중...');
  importIndex = new Map();
  projectRootCache = projectRoot;

  const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.git', 'out', 'build']);
  const allFiles: string[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        allFiles.push(full);
      }
    });
  }

  walk(path.join(projectRoot, 'src'));
  walk(path.join(projectRoot, 'pages'));

  let processed = 0;
  allFiles.forEach((filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const imports = extractImports(content, filePath, projectRoot);
      imports.forEach((imported) => {
        if (!importIndex!.has(imported)) importIndex!.set(imported, []);
        importIndex!.get(imported)!.push(filePath);
      });
      processed++;
      if (processed % 100 === 0) console.log(`[api-docs]   ${processed}/${allFiles.length}`);
    } catch { /* skip */ }
  });

  console.log(`[api-docs] 인덱스 완료: ${allFiles.length}개 파일`);
}

// ─────────────────────────────────────────────
// 페이지 파일 여부 (config.trace.pagePattern 반영)
// ─────────────────────────────────────────────
function isPage(filePath: string, projectRoot: string): boolean {
  const rel = path.relative(projectRoot, filePath).replace(/\\/g, '/');
  return (
    /\.(tsx)$/.test(filePath) &&
    (rel.includes('src/pages/') || /(?:^|\/)pages\/(?!api\/)/.test(rel)) &&
    !filePath.includes('_app') &&
    !filePath.includes('_document')
  );
}

// ─────────────────────────────────────────────
// shared 디렉토리 여부 (config 기반)
// ─────────────────────────────────────────────
function isSharedPath(relPath: string): boolean {
  return sharedDirsConfig.some((dir) => {
    const normalized = dir.replace(/\\/g, '/');
    return relPath.includes(normalized + '/') || relPath.includes('/' + normalized + '/');
  });
}

// ─────────────────────────────────────────────
// query 파일이 특정 메서드를 실제로 호출하는지
// ─────────────────────────────────────────────
function callsMethod(filePath: string, methodName: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // 소문자: .changeSubEmail( 직접 호출
    // 대문자 첫글자: onChangeSubEmail( 처럼 접두사 붙은 형태
    const capitalized = methodName.charAt(0).toUpperCase() + methodName.slice(1);
    return (
      new RegExp(`\\.${methodName}\\s*\\(`).test(content) ||
      new RegExp(`[A-Za-z]${capitalized}\\s*\\(`).test(content)
    );
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// 핵심 추적 로직 (단순 2단계)
// 1단계: api 파일을 import하고, 해당 메서드를 호출하는 query 파일 찾기
// 2단계: 그 query 파일을 직접 import하는 파일 찾기 (1hop)
// ─────────────────────────────────────────────
export function traceApiUsage(
  apiFunction: string,
  projectRoot: string,
  apiFilePath?: string
): ApiUsageChain {
  if (!importIndex) buildCallIndex(projectRoot);
  if (!apiFilePath || !fs.existsSync(apiFilePath)) {
    return { apiFunction, directCallers: [], pageCallers: [] };
  }

  // 1단계: api 파일을 import하는 파일 중 메서드를 실제 호출하는 것만
  const directImporters = importIndex!.get(apiFilePath) ?? [];
  const directCallers: UsageCaller[] = [];

  directImporters.forEach((filePath) => {
    if (!callsMethod(filePath, apiFunction)) return;
    const rel = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    const name = path.basename(filePath, path.extname(filePath));
    directCallers.push({ file: rel, functionName: name, isPage: isPage(filePath, projectRoot) });
  });

  // 2단계: directCaller 파일을 직접 import하는 파일 (1hop)
  // shared 디렉토리는 config 기반으로 제외
  const seen = new Set(directCallers.map((c) => c.file));
  const pageCallers: UsageCaller[] = [];

  directCallers.forEach((caller) => {
    const callerAbsPath = path.join(projectRoot, caller.file);
    const importers = importIndex!.get(callerAbsPath) ?? [];

    importers.forEach((filePath) => {
      const rel = path.relative(projectRoot, filePath).replace(/\\/g, '/');
      if (seen.has(rel)) return;
      // shared 디렉토리 제외 (config 기반)
      if (isSharedPath(rel)) return;
      // 2단계에서도 실제로 해당 메서드를 호출하는 파일만 포함
      if (!callsMethod(filePath, apiFunction)) return;
      seen.add(rel);
      const name = path.basename(filePath, path.extname(filePath));
      pageCallers.push({ file: rel, functionName: name, isPage: isPage(filePath, projectRoot) });
    });
  });

  return { apiFunction, directCallers, pageCallers };
}

// ─────────────────────────────────────────────
// 외부 진입점: config 기반 초기화
// ─────────────────────────────────────────────
export function loadFilesForTracing(
  projectRoot: string,
  alias?: Record<string, string>,
  sharedDirs?: string[]
): void {
  // config 값 캐싱
  if (alias) aliasConfig = alias;
  if (sharedDirs) sharedDirsConfig = sharedDirs;

  // import 인덱스 강제 리빌드 (config 변경 반영)
  importIndex = null;
  buildCallIndex(projectRoot);
}
