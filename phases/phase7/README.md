# Phase 7 — 프로젝트 구조화 및 품질 (Structure & Quality)

> **목표**: 장기 유지보수를 위한 코드 품질 확보, 모노레포 전환, npm 발행 준비.  
> **선행 조건**: Phase 2 완료 (어댑터 분리 후 패키지 구조 전환), 테스트는 언제든 시작 가능

---

## Feature 7-1: 테스트 프레임워크 구축

### 대상 파일
- 신규 `__tests__/` 디렉토리
- 신규 `jest.config.ts` 또는 `vitest.config.ts`

### 작업 내용

#### 테스트 프레임워크 선택

Vitest 권장 (TypeScript 네이티브 지원, ts-morph 프로젝트와 호환성 좋음).

```bash
npm install -D vitest
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['__tests__/**/*.test.ts'],
  },
});
```

#### 핵심 단위 테스트 목록

**file-scanner.test.ts**
```typescript
describe('convertFilePathToRoute', () => {
  it('일반 파일 경로 변환', () => {
    expect(convertFilePathToRoute('/api/user/index.ts', '/api'))
      .toBe('/api/user');
  });

  it('동적 세그먼트 변환', () => {
    expect(convertFilePathToRoute('/api/user/[id].ts', '/api'))
      .toBe('/api/user/:id');
  });

  it('catch-all 세그먼트 변환', () => {
    expect(convertFilePathToRoute('/api/user/[...slug].ts', '/api'))
      .toBe('/api/user/*slug');
  });
});
```

**ast-parser.test.ts**
```typescript
describe('extractMethodsFromSourceFile', () => {
  it('req.method === "GET" 패턴 감지', () => { /* ... */ });
  it('switch(req.method) 패턴 감지', () => { /* ... */ });
  it('export function GET 패턴 감지 (App Router)', () => { /* ... */ });
  it('메서드 미감지 시 ALL 반환', () => { /* ... */ });
});

describe('parseJsDoc', () => {
  it('@param 태그 파싱', () => { /* ... */ });
  it('@returns 태그 파싱', () => { /* ... */ });
  it('optional 파라미터 [param] 인식', () => { /* ... */ });
});
```

**model-resolver.test.ts**
```typescript
describe('resolveModelParams', () => {
  it('@Attribute 데코레이터에서 description 추출', () => { /* ... */ });
  it('@IsNotEmpty → required: true', () => { /* ... */ });
  it('@Min, @Max → 타입 힌트 생성', () => { /* ... */ });
  it('네임스페이스 클래스 (Model.SubClass) 탐색', () => { /* ... */ });
});
```

**usage-tracer.test.ts**
```typescript
describe('traceApiUsage', () => {
  it('1-hop: API → query 파일 추적', () => { /* ... */ });
  it('2-hop: query → 컴포넌트/페이지 추적', () => { /* ... */ });
  it('shared 디렉토리 제외', () => { /* ... */ });
  it('메서드명 대소문자 변형 인식', () => { /* ... */ });
});

describe('resolveAlias', () => {
  it('@/ → src/ 변환', () => { /* ... */ });
  it('상대 경로 ./  변환', () => { /* ... */ });
  it('외부 패키지 (@tanstack) 무시', () => { /* ... */ });
});
```

**client-api-scanner.test.ts**
```typescript
describe('extractUrl', () => {
  it('문자열 리터럴 URL 추출', () => { /* ... */ });
  it('템플릿 리터럴 URL 변환', () => { /* ... */ });
});
```

#### 테스트 Fixture

```
__tests__/
  ├── fixtures/
  │   ├── pages-router/
  │   │   ├── pages/api/user/[id].ts
  │   │   ├── pages/api/auth/login.ts
  │   │   └── package.json
  │   ├── app-router/
  │   │   ├── app/api/user/[id]/route.ts
  │   │   └── package.json
  │   ├── nuxt/
  │   │   ├── server/api/user/[id].get.ts
  │   │   ├── nuxt.config.ts
  │   │   └── package.json
  │   └── models/
  │       ├── user.model.ts        ← 데코레이터 테스트용
  │       └── account.api.ts       ← 클라이언트 스캔 테스트용
  ├── file-scanner.test.ts
  ├── ast-parser.test.ts
  ├── model-resolver.test.ts
  ├── usage-tracer.test.ts
  └── client-api-scanner.test.ts
```

### 검증 기준
- `npm test` 실행 시 전체 테스트 통과
- 커버리지 목표: 핵심 모듈 80% 이상

---

## Feature 7-2: packages/ 모노레포 리팩토링

### 작업 내용

CONTRIBUTING.md에 명시된 목표 구조로 전환.

#### 현재 구조 → 목표 구조

```
# 현재
scripts/
  generate-api-docs.ts
  lib/
    file-scanner.ts
    ast-parser.ts
    client-api-scanner.ts
    model-resolver.ts
    usage-tracer.ts
    html-generator.ts
    adapters/        (Phase 2에서 추가)
    exporters/       (Phase 4에서 추가)

# 목표
packages/
  core/
    src/
      file-scanner.ts
      ast-parser.ts
      client-api-scanner.ts
      model-resolver.ts
      usage-tracer.ts
      html-generator.ts
      exporters/
    package.json
    tsconfig.json
  adapters/
    nextjs-pages/
      src/index.ts
      package.json
    nextjs-app/
      src/index.ts
      package.json
    nuxt/
      src/index.ts
      package.json
  cli/
    src/
      index.ts         ← generate-api-docs.ts 이동
    package.json
config.ts              ← 루트 유지
```

#### npm workspaces 설정

```json
// 루트 package.json
{
  "private": true,
  "workspaces": [
    "packages/core",
    "packages/adapters/*",
    "packages/cli"
  ]
}
```

#### 각 패키지별 역할

| 패키지 | 설명 | 의존성 |
|--------|------|--------|
| `@fe-api-tracer/core` | 스캐너 엔진, HTML 생성, 내보내기 | ts-morph |
| `@fe-api-tracer/adapter-nextjs-pages` | Pages Router 어댑터 | @fe-api-tracer/core |
| `@fe-api-tracer/adapter-nextjs-app` | App Router 어댑터 | @fe-api-tracer/core |
| `@fe-api-tracer/adapter-nuxt` | Nuxt 3 어댑터 | @fe-api-tracer/core |
| `fe-api-tracer` (cli) | CLI 진입점 | core + 모든 어댑터 |

### 마이그레이션 전략
1. 먼저 `packages/` 구조 생성 (빈 패키지)
2. 파일 이동 (import 경로 자동 수정)
3. 각 패키지별 `tsconfig.json` 설정 (project references)
4. 루트에서 `npm install` → workspace 링크 확인
5. 기존 `scripts/` 디렉토리 제거

### 검증 기준
- `npm install` 후 워크스페이스 링크 정상
- `npm run build` 전 패키지 빌드 성공
- CLI 실행 결과가 리팩토링 전과 동일

---

## Feature 7-3: npm 패키지 발행 준비

### 대상 파일
- `packages/cli/package.json`
- `packages/cli/tsconfig.json`
- 루트 빌드 스크립트

### 작업 내용

#### package.json (cli)

```json
{
  "name": "fe-api-tracer",
  "version": "1.0.0",
  "bin": {
    "fe-api-tracer": "./dist/index.js"
  },
  "files": ["dist/"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@fe-api-tracer/core": "workspace:*",
    "@fe-api-tracer/adapter-nextjs-pages": "workspace:*",
    "@fe-api-tracer/adapter-nextjs-app": "workspace:*",
    "@fe-api-tracer/adapter-nuxt": "workspace:*"
  }
}
```

#### dist 빌드

```json
// packages/cli/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src/"]
}
```

#### 진입점 shebang

```typescript
// packages/cli/src/index.ts
#!/usr/bin/env node
import { loadConfig } from '../../../config';
// ...
```

#### defineConfig re-export

```typescript
// packages/core/src/index.ts
export { defineConfig } from '../../config';
export type { ApiTracerConfig, Framework } from '../../config';
```

이를 통해 사용자가 설정 파일에서:
```typescript
import { defineConfig } from 'fe-api-tracer';
```

### .npmignore 또는 files 필드

```
# 포함
dist/
README.md
LICENSE

# 제외 (files 필드로 관리)
__tests__/
examples/
phases/
.github/
```

### 검증 기준
- `npm pack` 실행 시 올바른 파일만 포함됨
- `npx fe-api-tracer` 실행 가능
- `import { defineConfig } from 'fe-api-tracer'`가 타입 힌트와 함께 동작

---

## 의존성 그래프

```
Feature 7-1 (테스트)    ← 언제든 시작 가능 (Phase 의존 없음)
    ↕ (독립)
Phase 2 완료
  └── Feature 7-2 (모노레포 리팩토링)
        └── Feature 7-3 (npm 발행 준비)
```

---

## 완료 기준 (DoD)

- [ ] Vitest 기반 테스트 프레임워크 설정 완료
- [ ] 핵심 모듈(5개)에 대한 단위 테스트 작성, 커버리지 80% 이상
- [ ] packages/ 모노레포 구조로 전환 완료
- [ ] npm workspaces 링크 정상 동작
- [ ] `npm pack` 후 `npx fe-api-tracer` CLI 실행 가능
- [ ] `defineConfig` import가 타입 힌트와 함께 동작
