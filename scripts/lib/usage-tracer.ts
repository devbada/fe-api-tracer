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
// Vuex dispatch 인덱스
// key: "모듈경로/액션명" (예: "account/client/getAccountEmail")
// value: 해당 dispatch를 호출하는 .vue 파일 절대경로 목록
// ─────────────────────────────────────────────
type VuexDispatchIndex = Map<string, string[]>;
let vuexDispatchIndex: VuexDispatchIndex | null = null;

// key: store 파일 절대경로 → 해당 파일이 속한 Vuex 모듈 경로
// 예: "/project/store/account/client/account-client.action.ts" → "account/client"
type StoreModuleMap = Map<string, string>;
let storeModuleMap: StoreModuleMap | null = null;

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
// .vue 파일에서 <script> 블록 추출
// ─────────────────────────────────────────────
function extractVueScript(content: string): string {
  // <script lang="ts"> ... </script> 또는 <script> ... </script>
  const match = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  return match ? match[1] : '';
}

// ─────────────────────────────────────────────
// Vuex dispatch 패턴 추출
// this.$store.dispatch('account/client/getAccountEmail', ...)
// this.$store.dispatch('account/client/getAccountEmail')
// dispatch('module/action')
// ─────────────────────────────────────────────
function extractVuexDispatches(content: string): string[] {
  const results: string[] = [];
  // $store.dispatch('...') 또는 dispatch('...')
  const pattern = /(?:\$store\.)?dispatch\s*\(\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    results.push(m[1]); // 예: "account/client/getAccountEmail"
  }
  return results;
}

// ─────────────────────────────────────────────
// Vuex getter 패턴 추출
// this.$store.getters['account/client/getAccount']
// ─────────────────────────────────────────────
function extractVuexGetters(content: string): string[] {
  const results: string[] = [];
  const pattern = /\$store\.getters\s*\[\s*['"]([^'"]+)['"]\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    results.push(m[1]);
  }
  return results;
}

// ─────────────────────────────────────────────
// store 디렉토리 구조에서 모듈 맵 빌드
// store/account/client/*.action.ts → "account/client"
// ─────────────────────────────────────────────
function buildStoreModuleMap(projectRoot: string): void {
  storeModuleMap = new Map();
  const storeDir = path.join(projectRoot, 'store');
  if (!fs.existsSync(storeDir)) return;

  function walk(dir: string): void {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && /\.(ts|tsx|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        // store/account/client/xxx.ts → "account/client"
        const relFromStore = path.relative(storeDir, path.dirname(full)).replace(/\\/g, '/');
        storeModuleMap!.set(full, relFromStore || '');
      }
    });
  }

  walk(storeDir);
  console.log(`[api-docs] Store 모듈 맵: ${storeModuleMap.size}개 파일`);
}

// ─────────────────────────────────────────────
// Vuex dispatch 인덱스 빌드 (.vue 파일 스캔)
// ─────────────────────────────────────────────
function buildVuexDispatchIndex(projectRoot: string): void {
  vuexDispatchIndex = new Map();
  buildStoreModuleMap(projectRoot);

  const SKIP_DIRS = new Set(['node_modules', '.nuxt', 'dist', '.git', 'out', 'build']);
  const vueFiles: string[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (entry.isFile() && /\.(vue|ts|tsx)$/.test(entry.name)) {
        vueFiles.push(full);
      }
    });
  }

  // src/, pages/, layouts/ 등 일반적인 Nuxt/Vue 디렉토리 스캔
  ['src', 'pages', 'layouts', 'components'].forEach((dir) => {
    walk(path.join(projectRoot, dir));
  });
  // src 내부의 하위 디렉토리도 이미 포함됨

  vueFiles.forEach((filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const scriptContent = filePath.endsWith('.vue') ? extractVueScript(content) : content;
      if (!scriptContent) return;

      const dispatches = extractVuexDispatches(scriptContent);
      const getters = extractVuexGetters(scriptContent);

      [...dispatches, ...getters].forEach((actionPath) => {
        if (!vuexDispatchIndex!.has(actionPath)) {
          vuexDispatchIndex!.set(actionPath, []);
        }
        if (!vuexDispatchIndex!.get(actionPath)!.includes(filePath)) {
          vuexDispatchIndex!.get(actionPath)!.push(filePath);
        }
      });
    } catch { /* skip */ }
  });

  console.log(`[api-docs] Vuex dispatch 인덱스: ${vuexDispatchIndex.size}개 액션 패턴 (${vueFiles.length}개 파일 스캔)`);
}

// ─────────────────────────────────────────────
// import 역방향 인덱스 빌드
// ─────────────────────────────────────────────
export function buildCallIndex(projectRoot: string): void {
  if (importIndex !== null && projectRootCache === projectRoot) return;

  console.log('[api-docs] import 인덱스 빌드 중...');
  importIndex = new Map();
  projectRootCache = projectRoot;

  const SKIP_DIRS = new Set(['node_modules', '.next', '.nuxt', 'dist', '.git', 'out', 'build']);
  const allFiles: string[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (entry.isFile() && /\.(ts|tsx|vue)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        allFiles.push(full);
      }
    });
  }

  walk(path.join(projectRoot, 'src'));
  walk(path.join(projectRoot, 'pages'));
  walk(path.join(projectRoot, 'store'));
  walk(path.join(projectRoot, 'layouts'));
  walk(path.join(projectRoot, 'components'));

  let processed = 0;
  allFiles.forEach((filePath) => {
    try {
      let content = fs.readFileSync(filePath, 'utf-8');
      // .vue 파일은 <script> 블록만 추출
      if (filePath.endsWith('.vue')) {
        content = extractVueScript(content);
        if (!content) return;
      }
      const imports = extractImports(content, filePath, projectRoot);
      imports.forEach((imported) => {
        if (!importIndex!.has(imported)) importIndex!.set(imported, []);
        importIndex!.get(imported)!.push(filePath);
      });
      processed++;
      if (processed % 100 === 0) console.log(`[api-docs]   ${processed}/${allFiles.length}`);
    } catch { /* skip */ }
  });

  // Vuex dispatch 인덱스도 함께 빌드
  buildVuexDispatchIndex(projectRoot);

  console.log(`[api-docs] 인덱스 완료: ${allFiles.length}개 파일`);
}

// ─────────────────────────────────────────────
// 페이지 파일 여부 (config.trace.pagePattern 반영)
// .vue 파일 + Nuxt/Vue 페이지 패턴 지원
// ─────────────────────────────────────────────
function isPage(filePath: string, projectRoot: string): boolean {
  const rel = path.relative(projectRoot, filePath).replace(/\\/g, '/');

  // Nuxt/Vue: pages/ 디렉토리 내 .vue 파일
  if (/\.vue$/.test(filePath)) {
    return (
      (rel.includes('src/pages/') || rel.startsWith('pages/') || /(?:^|\/)pages\/(?!api\/)/.test(rel)) &&
      !rel.includes('_') // _layout.vue, _error.vue 등 제외 (Nuxt 2 convention)
    );
  }

  // Next.js/React: .tsx 파일
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
// Vuex dispatch 경로에서 store 파일의 메서드와 매핑
// dispatch('account/client/getAccountEmail')
//   → modulePath: "account/client", actionName: "getAccountEmail"
//   → store/account/client/*.action.ts 의 getAccountEmail 메서드
// ─────────────────────────────────────────────
function findVuexDispatchCallers(
  apiFunction: string,
  apiFilePath: string,
  projectRoot: string
): string[] {
  if (!vuexDispatchIndex || !storeModuleMap) return [];

  // apiFilePath가 속한 Vuex 모듈 경로 확인
  const modulePath = storeModuleMap.get(apiFilePath);
  if (modulePath === undefined) return [];

  // dispatch 문자열: "모듈경로/메서드명" (예: "account/client/getAccountEmail")
  const dispatchKey = modulePath ? `${modulePath}/${apiFunction}` : apiFunction;
  const callers = vuexDispatchIndex.get(dispatchKey) ?? [];

  // getter 패턴도 확인 (같은 키 구조)
  // 또한, 중첩 모듈의 경우 다양한 경로 형태를 시도
  // 예: dispatch 시 네임스페이스가 다를 수 있음
  const allCallers = [...callers];

  // 부분 매칭: dispatch 키의 끝 부분이 apiFunction과 일치하는 경우도 포함
  vuexDispatchIndex.forEach((files, key) => {
    // key 끝부분이 /apiFunction 인 경우 (이미 정확 매칭은 위에서 처리)
    if (key !== dispatchKey && key.endsWith('/' + apiFunction)) {
      // modulePath가 key에 포함되어 있는지 확인 (관련성 검증)
      if (modulePath && key.includes(modulePath)) {
        files.forEach((f) => {
          if (!allCallers.includes(f)) allCallers.push(f);
        });
      }
    }
  });

  return allCallers;
}

// ─────────────────────────────────────────────
// 핵심 추적 로직 (단순 2단계 + Vuex dispatch)
// 1단계: api 파일을 import하고, 해당 메서드를 호출하는 query 파일 찾기
// 2단계: 그 query 파일을 직접 import하는 파일 찾기 (1hop)
// 3단계: Vuex dispatch로 해당 메서드를 호출하는 .vue 파일 찾기
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

  // 3단계: Vuex dispatch 기반 caller 추가
  // store action 파일에서 HTTP 호출 → dispatch로 해당 action을 호출하는 .vue 파일 연결
  const vuexCallerFiles = findVuexDispatchCallers(apiFunction, apiFilePath, projectRoot);
  vuexCallerFiles.forEach((filePath) => {
    const rel = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    if (seen.has(rel)) return;
    seen.add(rel);
    const name = path.basename(filePath, path.extname(filePath));
    pageCallers.push({ file: rel, functionName: name, isPage: isPage(filePath, projectRoot) });
  });

  // directCallers가 없지만 Vuex dispatch로 연결된 경우,
  // store action 파일 자체를 directCaller로 추가 (시각적 연결 표시)
  if (directCallers.length === 0 && vuexCallerFiles.length > 0 && storeModuleMap?.has(apiFilePath)) {
    const rel = path.relative(projectRoot, apiFilePath).replace(/\\/g, '/');
    const name = path.basename(apiFilePath, path.extname(apiFilePath));
    directCallers.push({ file: rel, functionName: name, isPage: false });
  }

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
  vuexDispatchIndex = null;
  storeModuleMap = null;
  buildCallIndex(projectRoot);
}

// ─────────────────────────────────────────────
// Vuex dispatch 인덱스 통계 (디버그용)
// ─────────────────────────────────────────────
export function getVuexDispatchStats(): { actionCount: number; fileCount: number } {
  if (!vuexDispatchIndex) return { actionCount: 0, fileCount: 0 };
  const allFiles = new Set<string>();
  vuexDispatchIndex.forEach((files) => files.forEach((f) => allFiles.add(f)));
  return { actionCount: vuexDispatchIndex.size, fileCount: allFiles.size };
}
