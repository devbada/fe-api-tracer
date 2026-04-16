import * as fs from 'fs';
import * as path from 'path';
import {
  Project, SyntaxKind, SourceFile,
} from 'ts-morph';
import { FrameworkAdapter } from './types';
import { RouteFile, extractGroup } from '../file-scanner';
import { ParsedEndpoint, HttpMethod, ParamInfo, ReturnsInfo } from '../ast-parser';

const ALLOWED_EXTENSIONS = ['.ts', '.js'];

// Nuxt 3 파일명 접미사 → HTTP 메서드 매핑
const FILE_SUFFIX_METHODS: Record<string, HttpMethod> = {
  '.get': 'GET',
  '.post': 'POST',
  '.put': 'PUT',
  '.delete': 'DELETE',
  '.patch': 'PATCH',
};

const project = new Project({
  compilerOptions: { allowJs: true },
  skipAddingFilesFromTsConfig: true,
});

/**
 * Nuxt 3 어댑터
 * server/api/**/*.ts 파일을 스캔하여 서버 라우트를 추출합니다.
 */
export class NuxtAdapter implements FrameworkAdapter {
  name = 'nuxt';

  detect(projectRoot: string): boolean {
    return (
      fs.existsSync(path.join(projectRoot, 'nuxt.config.ts')) ||
      fs.existsSync(path.join(projectRoot, 'nuxt.config.js'))
    );
  }

  scanApiRoutes(projectRoot: string): RouteFile[] {
    const apiDir = path.join(projectRoot, 'server', 'api');
    if (!fs.existsSync(apiDir)) {
      console.warn('[api-docs] server/api/ 디렉토리를 찾지 못했습니다.');
      return [];
    }

    const routes = this.scanServerApiDir(apiDir, apiDir, projectRoot);
    console.log(`[api-docs] server/api/ → ${routes.length}개 라우트 발견`);

    return routes
      .filter((r, i, arr) => arr.findIndex((x) => x.routePath === r.routePath && x.group === r.group) === i)
      .sort((a, b) => a.routePath.localeCompare(b.routePath));
  }

  parseRouteFile(filePath: string): ParsedEndpoint {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = project.createSourceFile(filePath, content, { overwrite: true });

    const methods = this.extractMethods(filePath, sourceFile);
    const description = this.extractDescription(sourceFile);

    return {
      methods,
      description,
      params: [],
      returns: null,
      sourceLine: 1,
    };
  }

  // ─────────────────────────────────────────────
  // 내부 유틸
  // ─────────────────────────────────────────────

  private scanServerApiDir(dirPath: string, apiRoot: string, projectRoot: string): RouteFile[] {
    const results: RouteFile[] = [];
    if (!fs.existsSync(dirPath)) return results;

    fs.readdirSync(dirPath, { withFileTypes: true }).forEach((entry) => {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        results.push(...this.scanServerApiDir(fullPath, apiRoot, projectRoot));
        return;
      }

      if (!entry.isFile()) return;
      const ext = path.extname(entry.name);
      if (!ALLOWED_EXTENSIONS.includes(ext)) return;
      if (entry.name.startsWith('_')) return;

      const routePath = this.convertNuxtPathToRoute(fullPath, apiRoot);
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
   * Nuxt 3 파일 경로를 REST 라우트로 변환
   * server/api/user/[id].get.ts  →  /api/user/:id
   * server/api/user/index.post.ts  →  /api/user
   * server/api/user/[...slug].ts  →  /api/user/*slug
   */
  private convertNuxtPathToRoute(filePath: string, apiRoot: string): string {
    let relative = path.relative(apiRoot, filePath).replace(/\\/g, '/');

    // 확장자 제거
    relative = relative.replace(/\.(ts|js)$/, '');

    // HTTP 메서드 접미사 제거 (.get, .post 등)
    for (const suffix of Object.keys(FILE_SUFFIX_METHODS)) {
      if (relative.endsWith(suffix)) {
        relative = relative.slice(0, -suffix.length);
        break;
      }
    }

    // index 제거
    relative = relative.replace(/\/index$/, '').replace(/^index$/, '');

    // 동적 세그먼트 변환
    const normalized = relative
      .replace(/\[\.\.\.(.+?)\]/g, '*$1')
      .replace(/\[(.+?)\]/g, ':$1');

    return `/api/${normalized}`;
  }

  /**
   * Nuxt 3 HTTP 메서드 추출
   * 1순위: 파일명 접미사 (.get.ts, .post.ts)
   * 2순위: getMethod(event) 비교문
   * 3순위: readBody → POST/PUT/PATCH 힌트, getQuery → GET 힌트
   * fallback: ALL
   */
  private extractMethods(filePath: string, sourceFile: SourceFile): HttpMethod[] {
    const methods = new Set<HttpMethod>();

    // 1순위: 파일명 접미사
    const nameWithoutExt = path.basename(filePath).replace(/\.(ts|js)$/, '');
    for (const [suffix, method] of Object.entries(FILE_SUFFIX_METHODS)) {
      if (nameWithoutExt.endsWith(suffix)) {
        methods.add(method);
        return Array.from(methods);
      }
    }

    // 2순위: getMethod(event) 비교문
    sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression).forEach((expr) => {
      const text = expr.getText();
      if (text.includes('getMethod') || text.includes('event.method') || text.includes('event.node.req.method')) {
        const match = text.match(/['"](\w+)['"]/);
        if (match) {
          const m = match[1].toUpperCase();
          if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(m)) {
            methods.add(m as HttpMethod);
          }
        }
      }
    });

    if (methods.size > 0) return Array.from(methods);

    // 3순위: readBody/getQuery 힌트
    const text = sourceFile.getFullText();
    if (text.includes('readBody')) methods.add('POST');
    if (text.includes('getQuery')) methods.add('GET');

    if (methods.size > 0) return Array.from(methods);

    methods.add('ALL');
    return Array.from(methods);
  }

  private extractDescription(sourceFile: SourceFile): string {
    // 파일 최상단 JSDoc 추출
    const jsDocs = sourceFile.getDescendantsOfKind(SyntaxKind.JSDoc);
    if (jsDocs.length > 0) {
      return jsDocs[0].getDescription()?.trim() ?? '';
    }
    return '';
  }
}
