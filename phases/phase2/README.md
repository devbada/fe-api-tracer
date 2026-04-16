# Phase 2 — 프레임워크 어댑터 아키텍처 (Adapter Pattern)

> **목표**: Next.js Pages Router에 결합된 로직을 어댑터 패턴으로 분리하여 다중 프레임워크 지원 기반 마련.  
> **선행 조건**: Phase 1 완료 (config 시스템 연동)

---

## 현재 문제점

- `file-scanner.ts`가 Next.js Pages Router(`pages/api/**`)에 직접 결합
- `ast-parser.ts`가 Pages Router(`req.method === 'GET'`)와 App Router(`export function GET`) 패턴을 한 파일에 혼재
- 새 프레임워크 추가 시 기존 파일을 수정해야 하는 구조 (OCP 위반)
- README와 CONTRIBUTING.md에 `FrameworkAdapter` 인터페이스가 설계되어 있으나 실제 코드 없음

---

## Feature 2-1: FrameworkAdapter 인터페이스 정의

### 대상 파일
- 신규 `scripts/lib/adapters/types.ts`

### 작업 내용

```typescript
import { RouteFile } from '../file-scanner';
import { ParsedEndpoint } from '../ast-parser';

export interface FrameworkAdapter {
  /** 어댑터 식별자 (config.framework 값과 매칭) */
  name: string;

  /** 이 어댑터가 해당 프로젝트에 적용 가능한지 감지 */
  detect(projectRoot: string): boolean;

  /** 서버 라우트 파일 스캔 — RouteFile[] 반환 */
  scanApiRoutes(projectRoot: string): RouteFile[];

  /** 라우트 파일에서 HTTP 메서드 + JSDoc 추출 */
  parseRouteFile(filePath: string): ParsedEndpoint;
}
```

### 설계 포인트
- `RouteFile`, `ParsedEndpoint`는 기존 인터페이스 재사용
- `detect()`는 프로젝트 루트의 설정 파일/디렉토리 존재 여부로 판별
- `scanApiRoutes()`와 `parseRouteFile()`을 분리하여 스캔 단계와 파싱 단계를 독립적으로 테스트 가능하게 함

---

## Feature 2-2: Next.js Pages Router 어댑터 추출

### 대상 파일
- 신규 `scripts/lib/adapters/nextjs-pages.ts`
- `scripts/lib/file-scanner.ts` (공통 유틸만 남기고 리팩토링)
- `scripts/lib/ast-parser.ts` (공통 유틸만 남기고 리팩토링)

### 작업 내용

기존 코드를 그대로 이동하는 것이 핵심. 새 로직을 작성하는 것이 아님.

```typescript
// scripts/lib/adapters/nextjs-pages.ts
import { FrameworkAdapter } from './types';

export class NextjsPagesAdapter implements FrameworkAdapter {
  name = 'nextjs-pages';

  detect(projectRoot: string): boolean {
    // next.config.{js,mjs,ts} 존재 + pages/api/ 존재
  }

  scanApiRoutes(projectRoot: string): RouteFile[] {
    // 기존 file-scanner.ts의 scanApiRoutes() 로직 이동
    // resolvePagesApiRoot() + scanDirectory() 활용
  }

  parseRouteFile(filePath: string): ParsedEndpoint {
    // 기존 ast-parser.ts의 parseApiFile() 로직
    // req.method 비교, switch 패턴 파싱
  }
}
```

### 리팩토링 후 file-scanner.ts

```typescript
// 공통 유틸만 남김
export interface RouteFile { ... }  // 인터페이스는 유지
export function convertFilePathToRoute(filePath: string, apiRoot: string): string { ... }
export function extractGroup(routePath: string): string { ... }
export function scanDirectory(dirPath: string, apiRoot: string): RouteFile[] { ... }

// scanApiRoutes()는 제거 → 어댑터로 이동
```

### 검증 기준
- 기존 `generate-api-docs.ts`의 서버 라우트 스캔 결과와 100% 동일
- `file-scanner.ts`에서 Pages Router 전용 로직이 제거됨

---

## Feature 2-3: Next.js App Router 어댑터

### 대상 파일
- 신규 `scripts/lib/adapters/nextjs-app.ts`

### 작업 내용

```typescript
export class NextjsAppAdapter implements FrameworkAdapter {
  name = 'nextjs-app';

  detect(projectRoot: string): boolean {
    // app/ 디렉토리 존재 + route.ts 파일이 하나 이상 존재
  }

  scanApiRoutes(projectRoot: string): RouteFile[] {
    // app/**/route.ts 패턴 스캔
    // 경로 변환 예시:
    //   app/api/user/[id]/route.ts  →  /api/user/:id
    //   app/api/auth/route.ts       →  /api/auth
    //   app/(group)/api/route.ts    →  /api  (route group 무시)
  }

  parseRouteFile(filePath: string): ParsedEndpoint {
    // App Router 패턴: export async function GET/POST/PUT/DELETE
    // 기존 ast-parser.ts의 extractMethodsFromSourceFile()에서
    // "App Router 패턴" 부분(134~140행)을 활용
  }
}
```

### URL 변환 규칙

| 파일 경로 | 라우트 |
|-----------|--------|
| `app/api/user/route.ts` | `/api/user` |
| `app/api/user/[id]/route.ts` | `/api/user/:id` |
| `app/api/user/[...slug]/route.ts` | `/api/user/*slug` |
| `app/(auth)/api/login/route.ts` | `/api/login` (route group 무시) |

### 주의사항
- `route.ts`가 아닌 파일(예: `page.tsx`, `layout.tsx`)은 무시
- `(group)` 패턴의 route group은 URL에서 제거
- 같은 프로젝트에 Pages Router와 App Router가 공존할 수 있음 (Next.js 13+ 마이그레이션)

---

## Feature 2-4: Nuxt 3 어댑터

### 대상 파일
- 신규 `scripts/lib/adapters/nuxt.ts`

### 작업 내용

```typescript
export class NuxtAdapter implements FrameworkAdapter {
  name = 'nuxt';

  detect(projectRoot: string): boolean {
    return fs.existsSync(path.join(projectRoot, 'nuxt.config.ts'))
        || fs.existsSync(path.join(projectRoot, 'nuxt.config.js'));
  }

  scanApiRoutes(projectRoot: string): RouteFile[] {
    // server/api/**/*.ts 스캔
    // URL 변환:
    //   server/api/user/[id].get.ts  →  /api/user/:id  (GET)
    //   server/api/user/index.post.ts → /api/user       (POST)
    //   server/api/user.ts           →  /api/user       (ALL)
  }

  parseRouteFile(filePath: string): ParsedEndpoint {
    // Nuxt 3 패턴: defineEventHandler(() => { ... })
    // HTTP 메서드 추출 전략:
    //   1순위: 파일명 접미사 (.get.ts, .post.ts)
    //   2순위: getMethod(event) === 'POST' 비교
    //   3순위: 메서드 미확인 시 'ALL'
  }
}
```

### Nuxt 3 라우팅 규칙

| 파일 경로 | 메서드 | 라우트 |
|-----------|--------|--------|
| `server/api/hello.ts` | ALL | `/api/hello` |
| `server/api/hello.get.ts` | GET | `/api/hello` |
| `server/api/hello.post.ts` | POST | `/api/hello` |
| `server/api/user/[id].ts` | ALL | `/api/user/:id` |
| `server/api/user/[...slug].ts` | ALL | `/api/user/*slug` |

### AST 파싱 포인트
- `defineEventHandler`의 콜백 함수에서 JSDoc 추출
- `readBody(event)` 호출 존재 시 → POST/PUT/PATCH 힌트
- `getQuery(event)` 호출 존재 시 → GET 힌트

---

## Feature 2-5: 어댑터 레지스트리 및 자동 선택

### 대상 파일
- 신규 `scripts/lib/adapters/registry.ts`
- `scripts/generate-api-docs.ts` (수정)

### 작업 내용

```typescript
// scripts/lib/adapters/registry.ts
import { FrameworkAdapter } from './types';
import { NextjsPagesAdapter } from './nextjs-pages';
import { NextjsAppAdapter } from './nextjs-app';
import { NuxtAdapter } from './nuxt';

const adapters: FrameworkAdapter[] = [
  new NextjsAppAdapter(),   // App Router를 먼저 검사 (Pages보다 우선)
  new NextjsPagesAdapter(),
  new NuxtAdapter(),
];

export function resolveAdapter(
  projectRoot: string,
  framework: string
): FrameworkAdapter | null {
  // 명시적 지정
  if (framework !== 'auto') {
    return adapters.find(a => a.name === framework) ?? null;
  }
  // 자동 감지
  return adapters.find(a => a.detect(projectRoot)) ?? null;
}
```

### generate-api-docs.ts 변경

```typescript
// ❌ Before
import { scanApiRoutes } from './lib/file-scanner';
import { parseApiFile } from './lib/ast-parser';
const routes = scanApiRoutes(PROJECT_ROOT);
const endpoint = parseApiFile(route.absolutePath);

// ✅ After
import { resolveAdapter } from './lib/adapters/registry';
const adapter = resolveAdapter(PROJECT_ROOT, config.framework);
if (adapter) {
  const routes = adapter.scanApiRoutes(PROJECT_ROOT);
  for (const route of routes) {
    const endpoint = adapter.parseRouteFile(route.absolutePath);
    // ...
  }
}
```

---

## 최종 디렉토리 구조

```
scripts/lib/
  ├── adapters/
  │   ├── types.ts              ← FrameworkAdapter 인터페이스
  │   ├── nextjs-pages.ts       ← Pages Router 어댑터
  │   ├── nextjs-app.ts         ← App Router 어댑터
  │   ├── nuxt.ts               ← Nuxt 3 어댑터
  │   └── registry.ts           ← 어댑터 레지스트리 + 자동 선택
  ├── file-scanner.ts           ← 공통 유틸만 (RouteFile, scanDirectory 등)
  ├── ast-parser.ts             ← 공통 AST 유틸만 (JSDoc 파싱 등)
  ├── client-api-scanner.ts
  ├── model-resolver.ts
  ├── usage-tracer.ts
  └── html-generator.ts
```

---

## 의존성 그래프

```
Feature 2-1 (인터페이스 정의)
  ├── Feature 2-2 (Pages Router 어댑터)  ← 기존 코드 이동
  ├── Feature 2-3 (App Router 어댑터)    ← 신규 구현
  └── Feature 2-4 (Nuxt 3 어댑터)       ← 신규 구현
        │
        └── Feature 2-5 (레지스트리 + 자동 선택)  ← 모든 어댑터 등록
```

---

## 완료 기준 (DoD)

- [ ] `FrameworkAdapter` 인터페이스가 정의되고 3개 어댑터가 구현됨
- [ ] `generate-api-docs.ts`가 어댑터를 통해 서버 라우트를 스캔함
- [ ] `config.framework: 'auto'`에서 프로젝트 타입 자동 감지
- [ ] `config.framework: 'nextjs-app'`처럼 명시적 지정 가능
- [ ] 기존 `file-scanner.ts`는 공통 유틸만 남고 Pages Router 전용 로직 제거
- [ ] Next.js Pages Router 결과가 리팩토링 전과 100% 동일
