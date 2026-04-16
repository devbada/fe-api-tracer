import * as fs from 'fs';
import * as path from 'path';
import { Framework } from '../../config';

// ─────────────────────────────────────────────
// 프레임워크 자동 감지
// 프로젝트 루트의 설정 파일 및 디렉토리 구조를 기반으로 판별
// ─────────────────────────────────────────────

function hasFile(projectRoot: string, ...names: string[]): boolean {
  return names.some((name) => fs.existsSync(path.join(projectRoot, name)));
}

function hasDirectory(projectRoot: string, dirName: string): boolean {
  const dirPath = path.join(projectRoot, dirName);
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

/**
 * app/ 디렉토리 내에 route.ts 파일이 존재하는지 확인
 * (Next.js App Router 판별용)
 */
function hasRouteFileInAppDir(projectRoot: string): boolean {
  const appDir = path.join(projectRoot, 'app');
  if (!fs.existsSync(appDir)) return false;

  function walk(dir: string): boolean {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (walk(full)) return true;
      } else if (entry.isFile() && /^route\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        return true;
      }
    }
    return false;
  }

  return walk(appDir);
}

/**
 * 프로젝트 루트를 분석하여 프레임워크를 자동 감지합니다.
 *
 * 감지 우선순위:
 * 1. Nuxt 3 — nuxt.config.ts|js 존재
 * 2. Next.js App Router — next.config + app/ 디렉토리 + route.ts 존재
 * 3. Next.js Pages Router — next.config + pages/api/ 존재
 * 4. Vue + Vite — vite.config + vue 의존성
 * 5. React + Vite — vite.config 존재
 * 6. fallback — nextjs-pages
 */
export function detectFramework(projectRoot: string): Framework {
  // Nuxt 3
  if (hasFile(projectRoot, 'nuxt.config.ts', 'nuxt.config.js')) {
    console.log('[api-docs] 프레임워크 감지: Nuxt 3');
    return 'nuxt';
  }

  // Next.js
  if (hasFile(projectRoot, 'next.config.js', 'next.config.mjs', 'next.config.ts')) {
    // App Router 판별: app/ 디렉토리 + route.ts 존재
    if (hasDirectory(projectRoot, 'app') && hasRouteFileInAppDir(projectRoot)) {
      console.log('[api-docs] 프레임워크 감지: Next.js App Router');
      return 'nextjs-app';
    }
    console.log('[api-docs] 프레임워크 감지: Next.js Pages Router');
    return 'nextjs-pages';
  }

  // Vite 기반 (Vue vs React)
  if (hasFile(projectRoot, 'vite.config.ts', 'vite.config.js')) {
    try {
      const pkgPath = path.join(projectRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (allDeps.vue || allDeps.nuxt) {
          console.log('[api-docs] 프레임워크 감지: Vue + Vite');
          return 'vue';
        }
      }
    } catch { /* ignore */ }

    console.log('[api-docs] 프레임워크 감지: React + Vite');
    return 'react';
  }

  console.log('[api-docs] 프레임워크 감지 실패, 기본값 사용: nextjs-pages');
  return 'nextjs-pages';
}
