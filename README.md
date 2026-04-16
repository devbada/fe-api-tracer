# fe-api-tracer

프론트엔드 코드베이스를 스캔하여 API 호출 목록, 파라미터, 사용 페이지를 인터랙티브 HTML 문서로 자동 생성합니다.

[![npm version](https://img.shields.io/npm/v/fe-api-tracer.svg)](https://www.npmjs.com/package/fe-api-tracer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

---

## 목차

- [설치 및 실행](#설치-및-실행)
- [설정 파일 만들기](#설정-파일-만들기)
- [프로젝트별 설정 예시](#프로젝트별-설정-예시)
  - [Next.js](#nextjs-pages-router)
  - [Nuxt 3](#nuxt-3)
  - [Vue + Vite](#vue--vite)
  - [Nuxt 2 / Vuex + Axios](#nuxt-2--vuex--axios)
- [CLI 옵션](#cli-옵션)
- [감지하는 HTTP 호출 패턴](#감지하는-http-호출-패턴)
- [사용처 추적 (Trace)](#사용처-추적-trace)
- [출력 포맷](#출력-포맷)
- [CI/CD 연동](#cicd-연동)
- [설정 레퍼런스](#설정-레퍼런스)

---

## 설치 및 실행

Node.js 20 이상이 필요합니다.

```bash
# 프로젝트에 설치
npm install -D fe-api-tracer

# 설치 없이 1회용으로 실행
npx fe-api-tracer

# → docs/api.html 생성됨. 브라우저에서 바로 열 수 있습니다.
```

package.json에 스크립트를 등록해두면 편합니다.

```jsonc
{
  "scripts": {
    "docs": "fe-api-tracer",
    "docs:watch": "fe-api-tracer --watch"
  }
}
```

```bash
# package.json 설정 후 실행
npm run docs
```

---

## 설정 파일 만들기

프로젝트 루트에 `fe-api-tracer.config.ts`를 만듭니다. `defineConfig` 없이 `export default`만으로 동작합니다.

```typescript
// fe-api-tracer.config.ts
export default {
  framework: 'vue',
  output: 'docs/api.html',
  scanDirs: ['src', 'store'],
  apiFilePattern: '\\.action\\.(ts|tsx)$',
  apiDirs: ['store/**/client'],
  httpClient: {
    patterns: ['this.store.$axios', '$axios'],
  },
  trace: {
    enabled: true,
    sharedDirs: ['src/app/shared', 'src/core'],
  },
};
```

> `defineConfig`를 사용하면 에디터에서 타입 힌트를 받을 수 있지만, 필수는 아닙니다.
>
> ```typescript
> import { defineConfig } from 'fe-api-tracer';
> export default defineConfig({ /* ... */ });
> ```

설정 파일이 없어도 `tsconfig.json`의 `paths` 설정과 프레임워크를 자동 감지하여 동작합니다. 자동 감지가 맞지 않을 때만 설정 파일을 만드세요.

### 설정 우선순위

```
CLI 플래그 > .env 파일 > fe-api-tracer.config.ts > tsconfig.json (alias) > 기본값
```

---

## 프로젝트별 설정 예시

### Next.js (Pages Router)

설정 파일 없이 자동 감지됩니다.

```bash
npm install -D fe-api-tracer
npx fe-api-tracer
# → pages/api/** 서버 라우트 + src/**/*.api.ts 클라이언트 호출 스캔
```

커스텀이 필요한 경우:

```typescript
// fe-api-tracer.config.ts
export default {
  framework: 'nextjs-pages',
  output: 'docs/api.html',
  apiDirs: ['src/domain/**/api', 'src/shared/api'],
  httpClient: {
    patterns: ['this.http', 'apiClient'],
  },
};
```

### Nuxt 3

설정 파일 없이 자동 감지됩니다.

```bash
npx fe-api-tracer
# → server/api/** 스캔 + useFetch/$fetch 패턴 감지
```

### Vue + Vite

```typescript
// fe-api-tracer.config.ts
export default {
  framework: 'vue',
  output: 'docs/api.html',
  httpClient: {
    patterns: ['apiClient', 'this.axios'],
  },
};
```

### Nuxt 2 / Vuex + Axios

Vuex 액션 파일에서 `$axios`를 사용하는 프로젝트는 아래처럼 설정합니다.

```
프로젝트 구조 예시:
store/
├── account/
│   └── client/
│       └── account-client.action.ts   ← this.store.$axios.get(...) 호출
├── payment/
│   └── client/
│       └── payment-client.action.ts
src/
└── app/
    └── mypage/
        └── Setting.vue                ← this.$store.dispatch('account/client/getAccountEmail')
```

```typescript
// fe-api-tracer.config.ts
export default {
  framework: 'vue',
  output: 'docs/api.html',
  scanDirs: ['src', 'store'],
  apiFilePattern: '\\.action\\.(ts|tsx)$',
  apiDirs: ['store/**/client'],
  httpClient: {
    patterns: ['this.store.$axios', '$axios'],
  },
  trace: {
    enabled: true,
    sharedDirs: ['src/app/shared', 'src/core'],
  },
};
```

Vuex 프로젝트에서의 추적 흐름:

```
store/account/client/account-client.action.ts
  → this.store.$axios.get('/api/account/email')    ← HTTP 호출 감지

src/app/mypage/Setting.vue
  → this.$store.dispatch('account/client/getAccountEmail')  ← Vuex dispatch 패턴으로 연결
```

참고사항:
- `${process.env.VUE_APP_API_URL}/api/users` 형태의 URL에서 환경변수 접두사는 자동 제거됩니다
- `.vue` 파일의 `<script>` 블록을 파싱하여 `dispatch`, `getters` 패턴을 감지합니다
- `@Watch('$store.state.xxx')` 패턴도 추적 대상에 포함됩니다

---

## CLI 옵션

```bash
# 기본 실행
npx fe-api-tracer

# 프로젝트 경로 지정
fe-api-tracer --root /path/to/project

# 출력 파일 변경
fe-api-tracer --output public/api-docs.html

# 프레임워크 수동 지정
fe-api-tracer --framework nextjs-app

# 출력 포맷 변경
fe-api-tracer --format openapi --output docs/api.yaml
fe-api-tracer --format postman --output docs/collection.json

# Watch 모드
fe-api-tracer --watch

# 환경 프리셋
fe-api-tracer --env ci
```

### JSDoc 스캐폴딩

JSDoc이 없는 함수에 자동으로 템플릿을 삽입합니다.

```bash
npx scaffold-jsdoc --root . --dry-run   # 미리보기
npx scaffold-jsdoc --root .             # 실제 삽입
```

### CI diff 모드

두 스냅샷을 비교해 API 변경사항을 감지합니다.

```bash
fe-api-tracer --output docs/baseline.api.json    # 기준 스냅샷
fe-api-tracer --output docs/current.api.json     # 현재 스냅샷
npx diff-api --before docs/baseline.api.json --after docs/current.api.json --exit-code
```

---

## 감지하는 HTTP 호출 패턴

### 클래스 기반 HTTP 클라이언트

기본 패턴: `this.http`, `this.axios`, `this.$axios`, `apiClient`, `request`

```typescript
this.http.get('/api/users');
this.http.post('/api/users', params);
apiClient.delete('/api/users/1');

// 체인 패턴 (Vuex 등)
this.store.$axios.get('/api/users');   // 패턴: '$axios' 또는 'this.store.$axios'
```

### fetch / $fetch

```typescript
fetch('/api/users');
fetch('/api/users', { method: 'POST' });
$fetch('/api/users');
```

### React Query / TanStack Query

```typescript
useQuery({ queryFn: () => apiClient.get('/api/users') });
useMutation({ mutationFn: (data) => apiClient.post('/api/users', data) });
```

### Vue Composition API

```typescript
useFetch('/api/users');
useAsyncData('users', () => $fetch('/api/users'));
```

---

## 사용처 추적 (Trace)

API 호출이 실제로 어느 페이지/컴포넌트에서 사용되는지 추적합니다.

### import 체인 방식 (React, Next.js, Nuxt 3 등)

```
user.api.ts                        ← HTTP 호출
  ↓ import
user.query.ts                      ← 직접 호출자
  ↓ import
pages/user/index.tsx               ← 페이지
```

### Vuex dispatch 방식 (Nuxt 2 / Vuex)

```
store/account/client/account-client.action.ts   ← HTTP 호출
  ↑ this.$store.dispatch('account/client/getAccountEmail')
src/app/mypage/Setting.vue                      ← 페이지
```

`.vue` 파일에서 `this.$store.dispatch('...')`, `this.$store.getters['...']` 패턴을 자동 감지하여 store 모듈 경로와 매핑합니다.

### 추적 설정

```typescript
export default {
  trace: {
    enabled: true,                              // 추적 활성화 (기본: true)
    exclude: ['Container', 'Mapper'],           // 추적에서 제외할 파일명 키워드
    sharedDirs: ['src/shared', 'shared'],       // 공유 디렉토리 (pageCaller에서 제외)
  },
};
```

---

## 출력 포맷

| 포맷 | 확장자 | 용도 |
|------|--------|------|
| HTML (기본) | `.html` | 인터랙티브 문서, 브라우저에서 바로 열기 |
| OpenAPI 3.0 | `.yaml` | Swagger UI 연동 |
| Postman | `.json` | Postman 가져오기 |
| JSON | `.api.json` | CI diff, 스냅샷 비교 |

---

## CI/CD 연동

### GitHub Actions

```yaml
name: API Docs Check
on: [pull_request]
jobs:
  api-diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: git checkout origin/main -- .
      - run: npx fe-api-tracer --output /tmp/baseline.api.json
      - run: git checkout -
      - run: npx fe-api-tracer --output /tmp/current.api.json
      - run: npx diff-api --before /tmp/baseline.api.json --after /tmp/current.api.json --exit-code
```

---

## 설정 레퍼런스

`fe-api-tracer.config.ts`에서 사용할 수 있는 전체 옵션입니다.

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `framework` | `string` | 자동 감지 | `'nextjs-pages'`, `'nextjs-app'`, `'nuxt'`, `'vue'` |
| `output` | `string` | `'docs/api.html'` | 출력 파일 경로 |
| `scanDirs` | `string[]` | `['src']` | 스캔할 디렉토리 |
| `apiFilePattern` | `string` | `'\.api\.(ts\|tsx)$'` | API 파일 이름 패턴 (정규식) |
| `apiDirs` | `string[]` | `['src/domain/**/api', ...]` | API 파일 디렉토리 필터 (glob) |
| `httpClient.patterns` | `string[]` | `['this.http', 'this.axios', ...]` | HTTP 클라이언트 패턴 |
| `alias` | `Record<string, string>` | tsconfig.json에서 자동 | path alias 매핑 |
| `trace.enabled` | `boolean` | `true` | 사용처 추적 활성화 |
| `trace.exclude` | `string[]` | `['Container', 'Mapper']` | 추적 제외 키워드 |
| `trace.sharedDirs` | `string[]` | `['src/shared', 'shared']` | 공유 디렉토리 (추적 제외) |
| `trace.vuex.enabled` | `boolean` | `true` | Vuex dispatch 추적 활성화 |
| `trace.vuex.storeDir` | `string` | `'store'` | store 디렉토리 경로 |
| `decorators.label` | `string[]` | `['Attribute', 'ApiProperty']` | 필드 라벨 데코레이터 |
| `decorators.required` | `string[]` | `['IsNotEmpty', 'IsNotBlank']` | 필수 여부 데코레이터 |
| `urlStripPrefix` | `string[]` | `[]` | URL에서 제거할 접두사 패턴 |

---

## 라이선스

MIT
