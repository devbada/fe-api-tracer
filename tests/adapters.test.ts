import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NextjsPagesAdapter } from '../scripts/lib/adapters/nextjs-pages';
import { NextjsAppAdapter } from '../scripts/lib/adapters/nextjs-app';
import { NuxtAdapter } from '../scripts/lib/adapters/nuxt';
import { resolveAdapter } from '../scripts/lib/adapters/registry';

describe('adapters', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapters-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relativePath: string, content: string = ''): string {
    const full = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
    return full;
  }

  // ─────────────────────────────────────────────
  // NextjsPagesAdapter
  // ─────────────────────────────────────────────
  describe('NextjsPagesAdapter', () => {
    const adapter = new NextjsPagesAdapter();

    it('next.config.js + pages/api가 있으면 detect() → true', () => {
      writeFile('next.config.js', 'module.exports = {};');
      writeFile('pages/api/users.ts', '');
      expect(adapter.detect(tmpDir)).toBe(true);
    });

    it('next.config.js가 없으면 detect() → false', () => {
      writeFile('pages/api/users.ts', '');
      expect(adapter.detect(tmpDir)).toBe(false);
    });

    it('pages/api가 없으면 detect() → false', () => {
      writeFile('next.config.js', '');
      expect(adapter.detect(tmpDir)).toBe(false);
    });

    it('scanApiRoutes로 pages/api 하위 파일을 스캔해야 한다', () => {
      writeFile('next.config.js', '');
      writeFile('pages/api/users.ts', 'export default function handler(req, res) { res.json([]); }');
      writeFile('pages/api/posts/index.ts', 'export default function handler(req, res) { res.json([]); }');
      writeFile('pages/api/posts/[id].ts', 'export default function handler(req, res) { res.json({}); }');

      const routes = adapter.scanApiRoutes(tmpDir);

      expect(routes.length).toBe(3);
      const paths = routes.map((r) => r.routePath).sort();
      expect(paths).toContain('/api/users');
      expect(paths).toContain('/api/posts');
      expect(paths).toContain('/api/posts/:id');
    });

    it('pages/api가 없으면 빈 배열을 반환해야 한다', () => {
      writeFile('next.config.js', '');
      const routes = adapter.scanApiRoutes(tmpDir);
      expect(routes).toEqual([]);
    });

    it('parseRouteFile이 ParsedEndpoint를 반환해야 한다', () => {
      const file = writeFile('pages/api/test.ts', `
        /**
         * 테스트 API
         */
        export default function handler(req, res) {
          if (req.method === 'GET') res.json([]);
        }
      `);

      const result = adapter.parseRouteFile(file);

      expect(result.methods).toContain('GET');
      expect(result.description).toBe('테스트 API');
    });
  });

  // ─────────────────────────────────────────────
  // NextjsAppAdapter
  // ─────────────────────────────────────────────
  describe('NextjsAppAdapter', () => {
    const adapter = new NextjsAppAdapter();

    it('next.config.js + app/route.ts가 있으면 detect() → true', () => {
      writeFile('next.config.js', '');
      writeFile('app/api/users/route.ts', '');
      expect(adapter.detect(tmpDir)).toBe(true);
    });

    it('app 디렉토리에 route.ts가 없으면 detect() → false', () => {
      writeFile('next.config.js', '');
      writeFile('app/page.tsx', '');
      expect(adapter.detect(tmpDir)).toBe(false);
    });

    it('scanApiRoutes가 route.ts 파일을 스캔해야 한다', () => {
      writeFile('next.config.js', '');
      writeFile('app/api/users/route.ts', 'export async function GET() { return Response.json([]); }');
      writeFile('app/api/users/[id]/route.ts', 'export async function GET() { return Response.json({}); }');
      writeFile('app/api/posts/route.ts', 'export async function POST() { return Response.json({}); }');

      const routes = adapter.scanApiRoutes(tmpDir);

      expect(routes.length).toBe(3);
      const paths = routes.map((r) => r.routePath).sort();
      expect(paths).toContain('/api/users');
      expect(paths).toContain('/api/users/:id');
      expect(paths).toContain('/api/posts');
    });

    it('Route Group (auth)를 무시해야 한다', () => {
      writeFile('next.config.js', '');
      writeFile('app/(auth)/api/login/route.ts', 'export async function POST() {}');

      const routes = adapter.scanApiRoutes(tmpDir);

      expect(routes.length).toBe(1);
      expect(routes[0].routePath).toBe('/api/login');
    });

    it('catch-all [...slug]를 *slug로 변환해야 한다', () => {
      writeFile('next.config.js', '');
      writeFile('app/api/docs/[...slug]/route.ts', 'export async function GET() {}');

      const routes = adapter.scanApiRoutes(tmpDir);

      expect(routes.length).toBe(1);
      expect(routes[0].routePath).toBe('/api/docs/*slug');
    });
  });

  // ─────────────────────────────────────────────
  // NuxtAdapter
  // ─────────────────────────────────────────────
  describe('NuxtAdapter', () => {
    const adapter = new NuxtAdapter();

    it('nuxt.config.ts가 있으면 detect() → true', () => {
      writeFile('nuxt.config.ts', '');
      expect(adapter.detect(tmpDir)).toBe(true);
    });

    it('nuxt.config이 없으면 detect() → false', () => {
      expect(adapter.detect(tmpDir)).toBe(false);
    });

    it('scanApiRoutes가 server/api 하위 파일을 스캔해야 한다', () => {
      writeFile('nuxt.config.ts', '');
      writeFile('server/api/users.ts', 'export default defineEventHandler(() => []);');
      writeFile('server/api/users/[id].get.ts', 'export default defineEventHandler(() => ({}));');
      writeFile('server/api/posts/index.post.ts', 'export default defineEventHandler(() => ({}));');

      const routes = adapter.scanApiRoutes(tmpDir);

      expect(routes.length).toBe(3);
      const paths = routes.map((r) => r.routePath).sort();
      expect(paths).toContain('/api/users');
      expect(paths).toContain('/api/users/:id');
      expect(paths).toContain('/api/posts');
    });

    it('_로 시작하는 파일을 무시해야 한다', () => {
      writeFile('nuxt.config.ts', '');
      writeFile('server/api/_utils.ts', '');
      writeFile('server/api/users.ts', 'export default defineEventHandler(() => []);');

      const routes = adapter.scanApiRoutes(tmpDir);

      expect(routes.length).toBe(1);
      expect(routes[0].routePath).toContain('users');
    });

    it('parseRouteFile이 파일명 접미사에서 HTTP 메서드를 추출해야 한다', () => {
      const file = writeFile('server/api/users.get.ts', `
        export default defineEventHandler((event) => {
          return [];
        });
      `);

      const result = adapter.parseRouteFile(file);

      expect(result.methods).toEqual(['GET']);
    });

    it('readBody가 있으면 POST로 감지해야 한다', () => {
      const file = writeFile('server/api/submit.ts', `
        export default defineEventHandler(async (event) => {
          const body = await readBody(event);
          return { ok: true };
        });
      `);

      const result = adapter.parseRouteFile(file);

      expect(result.methods).toContain('POST');
    });

    it('getQuery가 있으면 GET으로 감지해야 한다', () => {
      const file = writeFile('server/api/search.ts', `
        export default defineEventHandler((event) => {
          const query = getQuery(event);
          return [];
        });
      `);

      const result = adapter.parseRouteFile(file);

      expect(result.methods).toContain('GET');
    });

    it('메서드 정보가 없으면 ALL을 반환해야 한다', () => {
      const file = writeFile('server/api/ping.ts', `
        export default defineEventHandler(() => ({ status: 'ok' }));
      `);

      const result = adapter.parseRouteFile(file);

      expect(result.methods).toEqual(['ALL']);
    });
  });

  // ─────────────────────────────────────────────
  // resolveAdapter (registry)
  // ─────────────────────────────────────────────
  describe('resolveAdapter', () => {
    it('명시적 framework가 nextjs-pages이면 NextjsPagesAdapter를 반환해야 한다', () => {
      writeFile('next.config.js', '');
      writeFile('pages/api/test.ts', '');
      const adapter = resolveAdapter(tmpDir, 'nextjs-pages');
      expect(adapter).not.toBeNull();
      expect(adapter!.name).toBe('nextjs-pages');
    });

    it('명시적 framework가 nextjs-app이면 NextjsAppAdapter를 반환해야 한다', () => {
      writeFile('next.config.js', '');
      writeFile('app/api/test/route.ts', '');
      const adapter = resolveAdapter(tmpDir, 'nextjs-app');
      expect(adapter).not.toBeNull();
      expect(adapter!.name).toBe('nextjs-app');
    });

    it('명시적 framework가 nuxt이면 NuxtAdapter를 반환해야 한다', () => {
      writeFile('nuxt.config.ts', '');
      const adapter = resolveAdapter(tmpDir, 'nuxt');
      expect(adapter).not.toBeNull();
      expect(adapter!.name).toBe('nuxt');
    });

    it('vue/react 프레임워크에는 null을 반환해야 한다', () => {
      expect(resolveAdapter(tmpDir, 'vue')).toBeNull();
      expect(resolveAdapter(tmpDir, 'react')).toBeNull();
    });

    it('auto 감지 모드에서 어댑터를 찾아야 한다', () => {
      writeFile('nuxt.config.ts', '');
      writeFile('server/api/test.ts', '');
      const adapter = resolveAdapter(tmpDir, 'auto');
      // nuxt.config.ts가 있으므로 NuxtAdapter가 선택되어야 함
      expect(adapter).not.toBeNull();
      expect(adapter!.name).toBe('nuxt');
    });
  });
});
