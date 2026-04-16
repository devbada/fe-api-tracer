import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectFramework } from '../scripts/lib/framework-detector';

describe('framework-detector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-detect-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('nuxt.config.ts가 있으면 nuxt를 반환해야 한다', () => {
    fs.writeFileSync(path.join(tmpDir, 'nuxt.config.ts'), '');
    expect(detectFramework(tmpDir)).toBe('nuxt');
  });

  it('next.config.js + pages/api가 있으면 nextjs-pages를 반환해야 한다', () => {
    fs.writeFileSync(path.join(tmpDir, 'next.config.js'), '');
    fs.mkdirSync(path.join(tmpDir, 'pages', 'api'), { recursive: true });
    expect(detectFramework(tmpDir)).toBe('nextjs-pages');
  });

  it('next.config.js + app/route.ts가 있으면 nextjs-app를 반환해야 한다', () => {
    fs.writeFileSync(path.join(tmpDir, 'next.config.js'), '');
    fs.mkdirSync(path.join(tmpDir, 'app', 'api', 'users'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'app', 'api', 'users', 'route.ts'), '');
    expect(detectFramework(tmpDir)).toBe('nextjs-app');
  });

  it('vite.config.ts + vue 의존성이 있으면 vue를 반환해야 한다', () => {
    fs.writeFileSync(path.join(tmpDir, 'vite.config.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { vue: '^3.0.0' },
    }));
    expect(detectFramework(tmpDir)).toBe('vue');
  });

  it('vite.config.ts만 있으면 react를 반환해야 한다', () => {
    fs.writeFileSync(path.join(tmpDir, 'vite.config.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { react: '^18.0.0' },
    }));
    expect(detectFramework(tmpDir)).toBe('react');
  });

  it('설정 파일이 없으면 nextjs-pages를 기본값으로 반환해야 한다', () => {
    expect(detectFramework(tmpDir)).toBe('nextjs-pages');
  });
});
