import * as fs from 'fs';
import * as path from 'path';
import { FrameworkAdapter } from './types';
import { RouteFile, extractGroup } from '../file-scanner';
import { parseApiFile, ParsedEndpoint } from '../ast-parser';

const ALLOWED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * Next.js App Router 어댑터
 * app/**/route.ts 파일을 스캔하여 서버 라우트를 추출합니다.
 */
export class NextjsAppAdapter implements FrameworkAdapter {
  name = 'nextjs-app';

  detect(projectRoot: string): boolean {
    const hasNextConfig =
      fs.existsSync(path.join(projectRoot, 'next.config.js')) ||
      fs.existsSync(path.join(projectRoot, 'next.config.mjs')) ||
      fs.existsSync(path.join(projectRoot, 'next.config.ts'));
    if (!hasNextConfig) return false;

    const appDir = path.join(projectRoot, 'app');
    if (!fs.existsSync(appDir)) return false;

    return this.hasRouteFile(appDir);
  }

  scanApiRoutes(projectRoot: string): RouteFile[] {
    const appDir = path.join(projectRoot, 'app');
    if (!fs.existsSync(appDir)) {
      console.warn('[api-docs] app/ 디렉토리를 찾지 못했습니다.');
      return [];
    }

    const routes = this.scanAppDirectory(appDir, appDir, projectRoot);
    console.log(`[api-docs] app/ → ${routes.length}개 라우트 발견`);

    return routes
      .filter((r, i, arr) => arr.findIndex((x) => x.routePath === r.routePath) === i)
      .sort((a, b) => a.routePath.localeCompare(b.routePath));
  }

  parseRouteFile(filePath: string): ParsedEndpoint {
    return parseApiFile(filePath);
  }

  // ─────────────────────────────────────────────
  // 내부 유틸
  // ─────────────────────────────────────────────

  private hasRouteFile(dir: string): boolean {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (this.hasRouteFile(full)) return true;
      } else if (entry.isFile() && /^route\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        return true;
      }
    }
    return false;
  }

  private scanAppDirectory(dirPath: string, appRoot: string, projectRoot: string): RouteFile[] {
    const results: RouteFile[] = [];
    if (!fs.existsSync(dirPath)) return results;

    fs.readdirSync(dirPath, { withFileTypes: true }).forEach((entry) => {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        results.push(...this.scanAppDirectory(fullPath, appRoot, projectRoot));
        return;
      }

      if (!entry.isFile()) return;
      if (!/^route\.(ts|tsx|js|jsx)$/.test(entry.name)) return;

      const routePath = this.convertAppRouteToPath(fullPath, appRoot);
      const relativePath = path.relative(projectRoot, fullPath);

      results.push({
        absolutePath: fullPath,
        relativePath,
        routePath,
        group: extractGroup(routePath),
      });
    });

    return results;
  }

  /**
   * App Router 파일 경로를 REST 라우트로 변환
   * app/api/user/[id]/route.ts  →  /api/user/:id
   * app/(auth)/api/login/route.ts  →  /api/login  (route group 무시)
   */
  private convertAppRouteToPath(filePath: string, appRoot: string): string {
    const relative = path.relative(appRoot, path.dirname(filePath));
    const segments = relative
      .replace(/\\/g, '/')
      .split('/')
      .filter((seg) => {
        // Route Group 제거: (auth), (marketing) 등
        if (seg.startsWith('(') && seg.endsWith(')')) return false;
        return seg.length > 0;
      })
      .map((seg) => {
        // catch-all: [...slug] → *slug
        if (seg.startsWith('[...') && seg.endsWith(']')) {
          return '*' + seg.slice(4, -1);
        }
        // dynamic: [id] → :id
        if (seg.startsWith('[') && seg.endsWith(']')) {
          return ':' + seg.slice(1, -1);
        }
        return seg;
      });

    return '/' + segments.join('/');
  }
}
