import * as fs from 'fs';
import * as path from 'path';

export interface RouteFile {
  absolutePath: string;
  relativePath: string;
  routePath: string;
  group: string;
}

const ALLOWED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// ─────────────────────────────────────────────
// 공통 유틸 (어댑터에서 재사용)
// ─────────────────────────────────────────────

export function convertFilePathToRoute(filePath: string, apiRoot: string): string {
  const relative = path.relative(apiRoot, filePath);
  const withoutExt = relative.replace(/\.(ts|tsx|js|jsx)$/, '');
  const normalized = withoutExt
    .replace(/\\/g, '/')
    .replace(/\/index$/, '')
    .replace(/\[\.\.\.(.+?)\]/g, '*$1')
    .replace(/\[(.+?)\]/g, ':$1');
  return `/api/${normalized}`;
}

export function extractGroup(routePath: string): string {
  const parts = routePath.replace('/api/', '').split('/');
  return parts[0] || 'root';
}

export function scanDirectory(dirPath: string, apiRoot: string): RouteFile[] {
  const results: RouteFile[] = [];

  if (!fs.existsSync(dirPath)) return results;

  fs.readdirSync(dirPath, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      results.push(...scanDirectory(fullPath, apiRoot));
      return;
    }

    if (!entry.isFile()) return;
    if (!ALLOWED_EXTENSIONS.includes(path.extname(entry.name))) return;

    // Next.js 내부 파일 제외 (_app, _document 등)
    if (entry.name.startsWith('_')) return;

    const routePath = convertFilePathToRoute(fullPath, apiRoot);
    const relativePath = path.relative(process.cwd(), fullPath);

    results.push({
      absolutePath: fullPath,
      relativePath,
      routePath,
      group: extractGroup(routePath),
    });
  });

  return results;
}

// ─────────────────────────────────────────────
// 하위 호환: 기존 scanApiRoutes (Pages Router 전용)
// Phase 2 이후에는 어댑터를 통해 호출됨
// ─────────────────────────────────────────────

const PAGES_API_CANDIDATES = [
  'src/pages/api',
  'pages/api',
];

function resolvePagesApiRoot(projectRoot: string): string | null {
  for (const candidate of PAGES_API_CANDIDATES) {
    const full = path.join(projectRoot, candidate);
    if (fs.existsSync(full)) {
      console.log(`[api-docs] pages/api 경로 감지: ${candidate}`);
      return full;
    }
  }
  return null;
}

export function scanApiRoutes(projectRoot: string): RouteFile[] {
  const pagesApiRoot = resolvePagesApiRoot(projectRoot);

  if (!pagesApiRoot) {
    console.warn('[api-docs] pages/api 경로를 찾지 못했습니다. (탐색 경로:', PAGES_API_CANDIDATES.join(', '), ')');
    return [];
  }

  const routes = scanDirectory(pagesApiRoot, pagesApiRoot);
  console.log(`[api-docs] pages/api → ${routes.length}개 발견`);

  return routes
    .filter((r, i, arr) => arr.findIndex((x) => x.routePath === r.routePath) === i)
    .sort((a, b) => a.routePath.localeCompare(b.routePath));
}
