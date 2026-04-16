import { FrameworkAdapter } from './types';
import { NextjsAppAdapter } from './nextjs-app';
import { NextjsPagesAdapter } from './nextjs-pages';
import { NuxtAdapter } from './nuxt';

/**
 * 등록된 프레임워크 어댑터 목록
 * 순서가 중요: detect() 시 먼저 매칭된 어댑터 사용
 * App Router를 Pages Router보다 우선 검사 (더 구체적인 조건)
 */
const adapters: FrameworkAdapter[] = [
  new NextjsAppAdapter(),
  new NextjsPagesAdapter(),
  new NuxtAdapter(),
];

/**
 * 프레임워크에 맞는 어댑터를 반환합니다.
 *
 * @param projectRoot 프로젝트 루트 경로
 * @param framework config에서 지정된 프레임워크 ('auto'이면 자동 감지)
 * @returns 매칭된 어댑터 또는 null
 */
export function resolveAdapter(
  projectRoot: string,
  framework: string
): FrameworkAdapter | null {
  // 명시적 지정
  if (framework !== 'auto') {
    const found = adapters.find((a) => a.name === framework);
    if (found) {
      console.log(`[api-docs] 어댑터 지정: ${found.name}`);
      return found;
    }
    console.warn(`[api-docs] 알 수 없는 프레임워크: ${framework}`);
    return null;
  }

  // 자동 감지
  for (const adapter of adapters) {
    if (adapter.detect(projectRoot)) {
      console.log(`[api-docs] 어댑터 자동 감지: ${adapter.name}`);
      return adapter;
    }
  }

  console.warn('[api-docs] 서버 라우트 어댑터를 감지하지 못했습니다.');
  return null;
}

/**
 * 등록된 모든 어댑터 목록 반환 (테스트/디버그용)
 */
export function listAdapters(): FrameworkAdapter[] {
  return [...adapters];
}
