import * as fs from 'fs';
import * as path from 'path';
import { FrameworkAdapter } from './types';
import { RouteFile, convertFilePathToRoute, extractGroup, scanDirectory } from '../file-scanner';
import { parseApiFile, ParsedEndpoint } from '../ast-parser';

const PAGES_API_CANDIDATES = [
  'src/pages/api',
  'pages/api',
];

export class NextjsPagesAdapter implements FrameworkAdapter {
  name = 'nextjs-pages';

  detect(projectRoot: string): boolean {
    const hasNextConfig =
      fs.existsSync(path.join(projectRoot, 'next.config.js')) ||
      fs.existsSync(path.join(projectRoot, 'next.config.mjs')) ||
      fs.existsSync(path.join(projectRoot, 'next.config.ts'));
    if (!hasNextConfig) return false;

    return PAGES_API_CANDIDATES.some((candidate) =>
      fs.existsSync(path.join(projectRoot, candidate))
    );
  }

  scanApiRoutes(projectRoot: string): RouteFile[] {
    let pagesApiRoot: string | null = null;
    for (const candidate of PAGES_API_CANDIDATES) {
      const full = path.join(projectRoot, candidate);
      if (fs.existsSync(full)) {
        console.log(`[api-docs] pages/api 경로 감지: ${candidate}`);
        pagesApiRoot = full;
        break;
      }
    }

    if (!pagesApiRoot) {
      console.warn('[api-docs] pages/api 경로를 찾지 못했습니다.');
      return [];
    }

    const routes = scanDirectory(pagesApiRoot, pagesApiRoot);
    console.log(`[api-docs] pages/api → ${routes.length}개 발견`);

    return routes
      .filter((r, i, arr) => arr.findIndex((x) => x.routePath === r.routePath) === i)
      .sort((a, b) => a.routePath.localeCompare(b.routePath));
  }

  parseRouteFile(filePath: string): ParsedEndpoint {
    return parseApiFile(filePath);
  }
}
