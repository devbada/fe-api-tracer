import * as fs from 'fs';
import * as path from 'path';
import { scanApiRoutes } from './lib/file-scanner';
import { parseApiFile } from './lib/ast-parser';
import { scanClientApiCalls } from './lib/client-api-scanner';
import { generateHtml, ApiEntry } from './lib/html-generator';
import { loadConfig, ApiTracerConfig } from '../config';
import { detectFramework } from './lib/framework-detector';
import { resolveAdapter } from './lib/adapters/registry';
import { resolveExporter } from './lib/exporters/registry';

// ─────────────────────────────────────────────
// CLI 인자 파싱
// ─────────────────────────────────────────────
interface CliArgs {
  root?: string;
  output?: string;
  env?: string;
  framework?: string;
  format?: string;
  watch?: boolean;
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if ((arg === '--root' || arg === '-r') && next) {
      args.root = next;
      i++;
    } else if ((arg === '--output' || arg === '-o') && next) {
      args.output = next;
      i++;
    } else if ((arg === '--env' || arg === '-e') && next) {
      args.env = next;
      i++;
    } else if ((arg === '--framework' || arg === '-f') && next) {
      args.framework = next;
      i++;
    } else if (arg === '--format' && next) {
      args.format = next;
      i++;
    } else if (arg === '--watch' || arg === '-w') {
      args.watch = true;
    }
  }

  return args;
}

// ─────────────────────────────────────────────
// 프로젝트명 추출
// ─────────────────────────────────────────────
function getProjectName(projectRoot: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
    return pkg.name ?? 'API Docs';
  } catch {
    return 'API Docs';
  }
}

// ─────────────────────────────────────────────
// 단일 빌드 실행
// ─────────────────────────────────────────────
async function runBuild(cliArgs: CliArgs): Promise<void> {
  const PROJECT_ROOT = path.resolve(cliArgs.root ?? process.cwd());

  // config 로딩 (우선순위: CLI > .env > config 파일 > 기본값)
  const config = loadConfig(PROJECT_ROOT, cliArgs.env);

  // CLI 인자로 config 오버라이드
  if (cliArgs.output) config.output = cliArgs.output;
  if (cliArgs.framework) config.framework = cliArgs.framework as ApiTracerConfig['framework'];

  // framework 자동 감지
  if (config.framework === 'auto') {
    config.framework = detectFramework(PROJECT_ROOT);
  }

  const OUTPUT_FILE = path.resolve(PROJECT_ROOT, config.output);
  const OUTPUT_DIR = path.dirname(OUTPUT_FILE);

  console.log('[api-docs] 스캔 시작:', PROJECT_ROOT);
  console.log(`[api-docs] 설정: framework=${config.framework}, output=${config.output}`);

  // 1. 서버 라우트 스캔 (어댑터 기반)
  const serverEntries: ApiEntry[] = [];
  const adapter = resolveAdapter(PROJECT_ROOT, config.framework);

  if (adapter) {
    try {
      const routes = adapter.scanApiRoutes(PROJECT_ROOT);
      for (const route of routes) {
        try {
          const endpoint = adapter.parseRouteFile(route.absolutePath);
          serverEntries.push({ route, endpoint });
          console.log(`[api-docs] ✓ 서버라우트: ${route.routePath} (${endpoint.methods.join(', ')})`);
        } catch (err) {
          console.warn(`[api-docs] ✗ 서버라우트 파싱 실패 ${route.routePath}:`, (err as Error).message);
        }
      }
    } catch (err) {
      console.error('[api-docs] 서버 라우트 스캔 오류:', (err as Error).message);
    }
  } else {
    // 어댑터 없는 프레임워크 (vue, react) → 서버 라우트 스캔 스킵
    console.log('[api-docs] 서버 라우트 스캔 해당 없음 (클라이언트 호출만 스캔)');
  }

  // 2. 클라이언트 API 호출 (config 전달)
  let clientEntries: ReturnType<typeof scanClientApiCalls> = [];
  try {
    clientEntries = scanClientApiCalls(PROJECT_ROOT, config);
  } catch (err) {
    console.error('[api-docs] 클라이언트 API 스캔 오류:', (err as Error).message);
    console.error((err as Error).stack);
  }

  if (serverEntries.length === 0 && clientEntries.length === 0) {
    console.warn('[api-docs] 추출된 항목이 없습니다. 경로를 확인해주세요.');
    if (!cliArgs.watch) process.exit(0);
    return;
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 내보내기 포맷 결정 (확장자 또는 --format 옵션)
  const exporter = resolveExporter(OUTPUT_FILE, cliArgs.format);
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const output = exporter.generate(serverEntries, clientEntries, {
    projectName: getProjectName(PROJECT_ROOT),
    generatedAt: now,
  });
  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');

  console.log(`\n[api-docs] ✅ 완료 → ${OUTPUT_FILE}`);
  console.log(`[api-docs] 서버 라우트: ${serverEntries.length}개 / 클라이언트 호출: ${clientEntries.length}개`);
}

// ─────────────────────────────────────────────
// Watch 모드
// ─────────────────────────────────────────────
function startWatch(cliArgs: CliArgs): void {
  const PROJECT_ROOT = path.resolve(cliArgs.root ?? process.cwd());
  const watchDirs = ['src', 'pages', 'app', 'server'].map((d) => path.join(PROJECT_ROOT, d)).filter((d) => fs.existsSync(d));

  if (watchDirs.length === 0) {
    console.error('[api-docs] watch 대상 디렉토리가 없습니다 (src, pages, app, server)');
    process.exit(1);
  }

  let debounceTimer: NodeJS.Timeout | null = null;
  let isBuilding = false;

  const rebuild = async () => {
    if (isBuilding) return;
    isBuilding = true;
    console.log('\n[api-docs] 🔄 변경 감지 → 재빌드 시작...');
    try {
      await runBuild(cliArgs);
    } catch (err) {
      console.error('[api-docs] 빌드 오류:', (err as Error).message);
    }
    isBuilding = false;
  };

  const onChange = (eventType: string, filename: string | null) => {
    if (!filename) return;
    // .ts, .tsx, .js, .jsx 파일만 반응
    if (!/\.(ts|tsx|js|jsx)$/.test(filename)) return;
    // node_modules, .git 무시
    if (filename.includes('node_modules') || filename.includes('.git')) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(rebuild, 300);
  };

  console.log('[api-docs] 👀 Watch 모드 시작');
  console.log(`[api-docs] 감시 대상: ${watchDirs.map((d) => path.relative(PROJECT_ROOT, d)).join(', ')}`);
  console.log('[api-docs] 종료하려면 Ctrl+C를 누르세요.\n');

  // 초기 빌드
  rebuild();

  // 디렉토리 감시
  for (const dir of watchDirs) {
    fs.watch(dir, { recursive: true }, onChange);
  }
}

// ─────────────────────────────────────────────
// 메인 파이프라인
// ─────────────────────────────────────────────
async function main(): Promise<void> {
  const cliArgs = parseCliArgs(process.argv.slice(2));

  if (cliArgs.watch) {
    startWatch(cliArgs);
  } else {
    await runBuild(cliArgs);
  }
}

main().catch((err) => {
  console.error('[api-docs] 치명적 오류:', err);
  process.exit(1);
});
