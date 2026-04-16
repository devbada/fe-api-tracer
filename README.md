# fe-api-tracer

> **프론트엔드 API 문서 자동 생성기** — 프론트엔드 코드베이스를 스캔하여 모든 API 호출, 파라미터, 반환 타입, 그리고 실제로 어느 페이지에서 사용되는지를 인터랙티브 HTML 문서로 자동 생성합니다.

[![npm version](https://img.shields.io/npm/v/fe-api-tracer.svg)](https://www.npmjs.com/package/fe-api-tracer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## 이런 질문에 답합니다

> "이 API, 어느 페이지에서 쓰고 있어요?"

백엔드 개발자가 가장 많이 묻는 질문입니다. `fe-api-tracer`가 자동으로 답합니다.

```
account.api.ts
  └─ PATCH /accounts/change-sub-email
       └─ 파라미터: { subEmail: string }  ← 모델 데코레이터에서 자동 추출
       └─ account.query.ts               ← 이 API를 호출하는 쿼리
            └─ account-sub-email-edit.modal.tsx  ← 쿼리를 사용하는 컴포넌트
```

**결과물**: 단일 `docs/api.html` — 서버 없이 브라우저에서 바로 열 수 있습니다.

---

## 핵심 개념: "이 도구"와 "내 프로젝트"는 별개입니다

`fe-api-tracer`는 **분석 도구**이고, 분석 대상은 **여러분의 프론트엔드 프로젝트**입니다.

```
┌─────────────────────────────────────────────────────────────┐
│  여러분의 프론트엔드 프로젝트  (분석 대상)                         │
│                                                             │
│  my-frontend-app/                                           │
│  ├── package.json          ← 여러분의 프로젝트 설정              │
│  ├── src/                                                   │
│  │   ├── domain/user/api/user.api.ts   ← 이런 파일을 스캔합니다  │
│  │   └── pages/user/index.tsx          ← 사용처를 추적합니다     │
│  ├── pages/api/users.ts                ← 서버 라우트도 스캔합니다 │
│  └── docs/                                                  │
│      └── api.html          ← 결과물이 여기에 생성됩니다           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  fe-api-tracer  (분석 도구)                                   │
│                                                             │
│  fe-api-tracer/                                             │
│  ├── package.json          ← 도구 자체의 패키지 (건드릴 필요 없음) │
│  ├── scripts/              ← 스캔 엔진                       │
│  └── config.ts             ← 설정 타입 정의                   │
└─────────────────────────────────────────────────────────────┘
```

설치 후에는 `fe-api-tracer`의 소스를 직접 볼 일이 없습니다. 여러분의 프로젝트 안에서 CLI 명령어만 실행하면 됩니다.

---

## 주요 기능

- **설정 없이 바로 실행** — 프로젝트 루트를 가리키면 동작
- **API 라우트 스캔** — 프레임워크 라우팅 컨벤션에서 HTTP 메서드 + URL 자동 추출
- **모델 파싱** — `@Attribute`, `@IsEmail`, `@IsNotEmpty` 등 class-validator 데코레이터를 읽어 파라미터 문서화
- **사용처 추적** — API 정의 → 쿼리/서비스 → 컴포넌트 → 페이지까지 import 체인 추적
- **인터랙티브 HTML** — 검색, 메서드 필터, 통계 대시보드, 키보드 내비게이션, 다크모드
- **다중 출력 포맷** — HTML, OpenAPI 3.0, Postman Collection, JSON
- **Watch 모드** — 파일 변경 시 자동 재생성
- **CI diff 모드** — 브랜치 간 API 변경사항 비교
- **JSDoc 스캐폴딩** — 미작성 API에 주석 템플릿 자동 삽입

---

## 지원 프레임워크

| 프레임워크 | 서버 라우트 스캔 | 클라이언트 호출 스캔 | 사용처 추적 |
|-----------|:-----------:|:----------:|:-------:|
| **Next.js (Pages Router)** | `pages/api/**` | O | O |
| **Next.js (App Router)** | `app/**/route.ts` | O | O |
| **Nuxt.js 3** | `server/api/**` | O | O |
| **Vue.js + Vite** | — | O | O |
| **React + Vite** | — | O | O |

> — = 파일 기반 API 라우팅 없음. 클라이언트 호출 스캔과 사용처 추적은 정상 동작합니다.

---

## 빠른 시작

### 사전 조건

- Node.js 16 이상
- 분석 대상이 될 프론트엔드 프로젝트가 있어야 합니다

### Step 1 — 여러분의 프로젝트에 설치

여러분의 프론트엔드 프로젝트 디렉토리에서 실행합니다.

```bash
cd ~/projects/my-frontend-app

npm install -D fe-api-tracer
```

<details>
<summary>npm 대신 로컬 소스로 설치하기 (개발/기여용)</summary>

```bash
# 1. 소스 받기
git clone https://github.com/devbada/fe-api-tracer.git
cd fe-api-tracer

# 2. 의존성 설치 + 빌드 (prepare 훅이 자동으로 tsc 실행)
npm install

# 3. 여러분의 프로젝트에 로컬 경로로 설치
cd ~/projects/my-frontend-app
npm install -D ../fe-api-tracer            # 상대 경로
npm install -D /home/user/tools/fe-api-tracer  # 또는 절대 경로
```

> `npm link`를 사용할 수도 있습니다. `fe-api-tracer/` 디렉토리에서 `npm link`를 실행한 후, 여러분의 프로젝트에서 `npm link fe-api-tracer`를 실행하면 심볼릭 링크로 연결됩니다. 도구 소스를 수정하면서 바로 테스트하고 싶을 때 유용합니다.

</details>

### Step 2 — 여러분의 package.json에 스크립트 등록

```jsonc
// my-frontend-app/package.json  ← 여러분의 프로젝트 설정
{
  "name": "my-frontend-app",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "docs": "fe-api-tracer",
    "docs:watch": "fe-api-tracer --watch",
    "postbuild": "fe-api-tracer"
  },
  "devDependencies": {
    "fe-api-tracer": "^1.0.0"
  }
}
```

> `fe-api-tracer`의 자체 `package.json`과 혼동하지 마세요. 위는 **여러분의 프로젝트** `package.json`입니다.

### Step 3 — 실행

```bash
# 여러분의 프로젝트 루트에서 실행
npm run docs

# 결과: my-frontend-app/docs/api.html 생성
```

`docs/api.html`을 브라우저에서 열면 인터랙티브 API 문서를 볼 수 있습니다.

---

## 실행 방법 총정리

모든 명령어는 **여러분의 프론트엔드 프로젝트 루트**에서 실행합니다.

### 기본 실행

```bash
# npm script 방식 (권장)
npm run docs

# npx 방식 (설치 없이 1회 실행)
npx fe-api-tracer

# 직접 실행 (글로벌 설치 후)
fe-api-tracer
```

### CLI 옵션

```bash
# 프로젝트 경로 지정 (다른 디렉토리를 분석할 때)
fe-api-tracer --root /path/to/my-frontend-app

# 출력 파일 변경
fe-api-tracer --output public/api-docs.html

# 프레임워크 수동 지정
fe-api-tracer --framework nextjs-app

# 출력 포맷 변경
fe-api-tracer --format openapi --output docs/api.yaml
fe-api-tracer --format postman --output docs/collection.json
fe-api-tracer --output docs/snapshot.api.json   # JSON 스냅샷 (확장자로 자동 감지)

# Watch 모드 — 소스 변경 시 자동 재생성
fe-api-tracer --watch

# 환경 프리셋 선택
fe-api-tracer --env ci
fe-api-tracer --env staging
```

### JSDoc 스캐폴딩

JSDoc이 없는 함수에 자동으로 템플릿을 삽입합니다.

```bash
# 미리보기 (실제 변경 없음)
npx scaffold-jsdoc --root . --dry-run

# 실제 삽입
npx scaffold-jsdoc --root .

# 특정 패턴만
npx scaffold-jsdoc --root . --pattern "src/domain/**/api/*.ts"
```

### CI diff 모드

두 스냅샷을 비교해 API 변경사항을 감지합니다.

```bash
# 1. 기준 스냅샷 생성 (main 브랜치)
fe-api-tracer --output docs/baseline.api.json

# 2. 현재 브랜치 스냅샷 생성
fe-api-tracer --output docs/current.api.json

# 3. diff 비교
npx diff-api --before docs/baseline.api.json --after docs/current.api.json

# 마크다운 리포트 생성
npx diff-api --before docs/baseline.api.json --after docs/current.api.json --output docs/diff-report.md

# CI에서 변경 있으면 exit code 1 (PR 체크용)
npx diff-api --before docs/baseline.api.json --after docs/current.api.json --exit-code
```

---

## 설정 가이드

프로젝트마다 API 구조, 경로 컨벤션, HTTP 클라이언트 패턴이 다릅니다. `fe-api-tracer`는 3가지 방식으로 유연하게 설정할 수 있습니다.

> 아래 설정 파일은 모두 **여러분의 프론트엔드 프로젝트 루트**에 생성합니다.

### 설정 우선순위

```
CLI 플래그 > .env 파일 > fe-api-tracer.config.ts > tsconfig.json (alias) > 기본값
```

### 방법 1 — 설정 없이 바로 사용 (자동 감지)

`fe-api-tracer`는 프레임워크를 자동으로 감지합니다.

```
nuxt.config.ts 존재?              → Nuxt 3
next.config.js + app/route.ts?    → Next.js App Router
next.config.js + pages/api/?      → Next.js Pages Router
vite.config.ts + vue 의존성?       → Vue + Vite
vite.config.ts?                   → React + Vite
```

`tsconfig.json`의 `paths` 설정도 자동으로 읽습니다. 많은 프로젝트에서 별도 설정 없이 바로 동작합니다.

### 방법 2 — .env 파일 (간단한 커스텀)

여러분의 프로젝트 루트에 `.env.api-tracer` 파일을 만듭니다.

```bash
# my-frontend-app/.env.api-tracer

FE_API_TRACER_OUTPUT=docs/api.html
FE_API_TRACER_FRAMEWORK=nextjs-pages
FE_API_TRACER_API_DIRS=src/domain/**/api,src/shared/api
FE_API_TRACER_HTTP_PATTERNS=this.http,this.axios,apiClient
FE_API_TRACER_SHARED_DIRS=src/shared
```

### 방법 3 — fe-api-tracer.config.ts (권장, 상세 설정)

여러분의 프로젝트 루트에 설정 파일을 만듭니다. TypeScript 타입 힌트가 지원됩니다.

```typescript
// my-frontend-app/fe-api-tracer.config.ts
import { defineConfig } from 'fe-api-tracer';

export default defineConfig({
  framework: 'nextjs-pages',
  output: 'docs/api.html',

  // API 파일 디렉토리 (glob 패턴)
  apiDirs: [
    'src/domain/**/api',
    'src/shared/api',
  ],

  // HTTP 클라이언트 호출 패턴
  // 여러분의 프로젝트에서 사용하는 HTTP 클라이언트 패턴을 지정합니다
  httpClient: {
    patterns: ['this.http', 'this.axios', 'apiClient'],
    methods: ['get', 'post', 'put', 'patch', 'delete'],
  },

  // path alias (tsconfig.json에서 자동 읽기, 추가 필요시 지정)
  alias: {
    '@/': './src/',
    '@domain/': './src/domain/',
  },

  // 사용처 추적 설정
  trace: {
    exclude: ['Container', 'Mapper', 'Injectable'],
    sharedDirs: ['src/shared'],
    queryPattern: /\.query\.(ts|tsx)$/,
    pagePattern: /src\/pages\/|(?:^|\/)pages\/(?!api\/)/,
  },

  // 모델 데코레이터 매핑
  decorators: {
    label: ['Attribute', 'ApiProperty'],
    required: ['IsNotEmpty', 'IsNotBlank'],
  },
});
```

### 방법 4 — 멀티 환경 프리셋

`--env` 플래그로 환경별 설정을 전환합니다.

```typescript
// my-frontend-app/fe-api-tracer.config.ts
import { defineConfig } from 'fe-api-tracer';

export default defineConfig({
  presets: {
    default: {
      framework: 'nextjs-pages',
      output: 'docs/api.html',
    },
    ci: {
      framework: 'nextjs-pages',
      output: 'public/api.html',
      trace: { enabled: false },   // CI에서는 추적 스킵 (속도 우선)
    },
  },
});
```

```bash
npm run docs                  # default 프리셋
npm run docs -- --env ci      # CI 프리셋
```

---

## 프로젝트별 적용 예시

### Next.js (Pages Router) 프로젝트

```
my-nextjs-app/
├── package.json                ← 여기에 "docs": "fe-api-tracer" 추가
├── pages/
│   ├── api/
│   │   ├── users.ts            ← 서버 라우트로 스캔됨
│   │   └── posts/[id].ts
│   └── users/index.tsx         ← 사용처 추적 대상
├── src/
│   └── domain/user/
│       ├── api/user.api.ts     ← 클라이언트 호출로 스캔됨
│       └── query/user.query.ts ← import 체인 추적됨
└── docs/
    └── api.html                ← 결과물
```

```bash
cd my-nextjs-app
npm install -D fe-api-tracer
npx fe-api-tracer
# → docs/api.html 생성 완료
```

### Nuxt 3 프로젝트

```
my-nuxt-app/
├── package.json
├── nuxt.config.ts              ← 자동으로 Nuxt 3 감지
├── server/
│   └── api/
│       ├── users.get.ts        ← 파일명 접미사에서 GET 추출
│       ├── users.post.ts       ← POST
│       └── users/[id].get.ts   ← /api/users/:id
├── composables/
│   └── useUser.ts              ← useFetch, $fetch 패턴 감지
└── docs/
    └── api.html
```

```bash
cd my-nuxt-app
npm install -D fe-api-tracer
npx fe-api-tracer
# → Nuxt 3 자동 감지, server/api/** 스캔
```

### Vue + Vite 프로젝트 (서버 라우트 없음)

```
my-vue-app/
├── package.json
├── vite.config.ts
├── src/
│   ├── api/
│   │   └── user.api.ts         ← this.http.get('/api/users') 감지
│   ├── composables/
│   │   └── useUser.ts          ← useFetch 패턴 감지
│   └── views/
│       └── UserList.vue
└── docs/
    └── api.html
```

```bash
cd my-vue-app
npm install -D fe-api-tracer
npx fe-api-tracer
# → 서버 라우트 스캔 스킵, 클라이언트 호출만 스캔
```

---

## 감지하는 HTTP 호출 패턴

`fe-api-tracer`는 다음 패턴들을 자동으로 감지합니다.

**클래스 기반 HTTP 클라이언트** (기본 패턴: `this.http`, `this.axios`, `apiClient`, `request`)

```typescript
// 모두 감지됨
this.http.get('/api/users');
this.http.post('/api/users', params);
this.axios.put(`/api/users/${id}`, data);
apiClient.delete('/api/users/1');
```

**fetch / $fetch 직접 호출**

```typescript
fetch('/api/users');
fetch('/api/users', { method: 'POST', body: JSON.stringify(data) });
$fetch('/api/users');   // Nuxt
```

**React Query / TanStack Query**

```typescript
useQuery({ queryFn: () => apiClient.get('/api/users') });
useMutation({ mutationFn: (data) => apiClient.post('/api/users', data) });
```

**Vue Composition API**

```typescript
useFetch('/api/users');
useFetch('/api/users', { method: 'POST' });
useAsyncData('users', () => $fetch('/api/users'));
```

---

## 동작 원리

### 1단계 — 서버 라우트 스캔

프레임워크별 어댑터가 파일 시스템 컨벤션에서 라우트를 추출합니다.

```
Next.js Pages:  pages/api/user/[id].ts       → GET /api/user/:id
Next.js App:    app/api/user/[id]/route.ts   → GET /api/user/:id
Nuxt 3:         server/api/user/[id].get.ts  → GET /api/user/:id
```

### 2단계 — 클라이언트 호출 스캔

`*.api.ts` 파일에서 HTTP 메서드 호출을 AST로 파싱합니다.

```typescript
return this.http.post(`/accounts/change-sub-email`, params);
//     ^^^^^^^^^ ^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^  ^^^^^^
//     패턴 매칭  메서드  URL 추출                     파라미터 타입 추적
```

### 3단계 — 모델 파라미터 추출

TypeScript 타입을 추적하고 class-validator 데코레이터를 읽습니다.

```typescript
export class ChangeSubEmail {
  @Attribute('이메일')   // → description: "이메일"
  @IsEmail()             // → hint: "email 형식"
  @IsNotEmpty()          // → required: true
  subEmail!: string;     // → type: "string"
}
```

### 4단계 — 사용처 추적 (2-hop)

import 심볼 인덱스를 빌드하고 2단계 추적합니다.

```
account.api.ts  →  AccountApi
  ↓ import + changeSubEmail() 호출
account.query.ts  →  AccountQuery
  ↓ import + onChangeSubEmail() 호출
account-sub-email-edit.modal.tsx  ← 화면으로 표시
```

---

## 출력 포맷

| 포맷 | 확장자 | 용도 |
|------|--------|------|
| **HTML** (기본) | `.html` | 인터랙티브 문서, 브라우저에서 바로 열기 |
| **OpenAPI 3.0** | `.yaml` / `.yml` | Swagger UI 연동, API Gateway 설정 |
| **Postman** | `.json` | Postman 가져오기, 팀 공유 |
| **JSON** | `.api.json` | CI diff, 스냅샷 비교, 커스텀 도구 연동 |

```bash
fe-api-tracer --output docs/api.html           # HTML (기본)
fe-api-tracer --output docs/openapi.yaml       # OpenAPI 3.0
fe-api-tracer --output docs/collection.json    # Postman
fe-api-tracer --output docs/snapshot.api.json  # JSON 스냅샷
```

---

## CI/CD 연동

### GitHub Actions 예시

```yaml
# .github/workflows/api-docs.yml
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
          node-version: '18'

      - run: npm ci

      # main 브랜치 기준 스냅샷
      - run: git checkout origin/main -- .
      - run: npx fe-api-tracer --output /tmp/baseline.api.json
      - run: git checkout -

      # 현재 PR 스냅샷
      - run: npx fe-api-tracer --output /tmp/current.api.json

      # diff 비교 — 변경 있으면 실패
      - run: npx diff-api --before /tmp/baseline.api.json --after /tmp/current.api.json --output pr-api-diff.md --exit-code

      # (선택) PR 코멘트로 diff 리포트 첨부
      - uses: marocchino/sticky-pull-request-comment@v2
        if: failure()
        with:
          path: pr-api-diff.md
```

---

## 어댑터 API (기여자용)

새 프레임워크 지원은 `FrameworkAdapter` 인터페이스를 구현하면 됩니다.

```typescript
export interface FrameworkAdapter {
  name: string;
  detect(projectRoot: string): boolean;
  scanApiRoutes(projectRoot: string): RouteFile[];
  parseRouteFile(filePath: string): ParsedEndpoint;
}
```

구현 후 `scripts/lib/adapters/registry.ts`의 `adapters` 배열에 추가하면 자동으로 감지 체인에 포함됩니다.

---

## 프로젝트 구조

```
fe-api-tracer/
├── config.ts                      # 설정 타입, loadConfig, defineConfig
├── scripts/
│   ├── generate-api-docs.ts       # 메인 파이프라인 (CLI 진입점)
│   ├── scaffold-jsdoc.ts          # JSDoc 스캐폴딩 CLI
│   ├── diff-api.ts                # API 스냅샷 diff CLI
│   └── lib/
│       ├── ast-parser.ts          # JSDoc, HTTP 메서드 AST 파싱
│       ├── file-scanner.ts        # 파일 시스템 라우트 스캔
│       ├── client-api-scanner.ts  # 클라이언트 API 호출 감지
│       ├── model-resolver.ts      # 모델 클래스 데코레이터 파싱
│       ├── usage-tracer.ts        # import 체인 2-hop 추적
│       ├── html-generator.ts      # 인터랙티브 HTML 생성
│       ├── framework-detector.ts  # 프레임워크 자동 감지
│       ├── adapters/              # 프레임워크별 어댑터
│       │   ├── types.ts
│       │   ├── nextjs-pages.ts
│       │   ├── nextjs-app.ts
│       │   ├── nuxt.ts
│       │   └── registry.ts
│       └── exporters/             # 출력 포맷 내보내기
│           ├── types.ts
│           ├── html-exporter.ts
│           ├── openapi-exporter.ts
│           ├── postman-exporter.ts
│           ├── json-exporter.ts
│           └── registry.ts
├── tests/                         # Vitest 테스트
├── bin/                           # CLI 래퍼
└── package.json                   # 도구 자체의 패키지 설정
```

---

## 기술 스택

| 기술 | 용도 |
|------|------|
| **TypeScript** | 핵심 구현 |
| **ts-morph** | JSDoc, 모델 데코레이터 AST 파싱 |
| **Import Symbol Index** | 빠른 사용처 추적 (전체 타입 추론 대신 텍스트 기반) |
| **Vitest** | 테스트 프레임워크 |

### 왜 TypeScript Language Server를 사용하지 않나요?

전체 TS 타입 추론은 정확하지만 느립니다 (프로젝트당 5~30초). 대신 **import 심볼 인덱스 + 텍스트 검색** 방식을 사용하여 대부분의 프로젝트에서 3초 이내에 완료됩니다. 트레이드오프로 일반적인 메서드명에서 간헐적 오탐이 발생할 수 있으나, import 존재 + 메서드 호출 존재를 동시에 확인하여 최소화합니다.

---

## 로드맵

- [x] Next.js Pages Router 어댑터
- [x] Next.js App Router 어댑터
- [x] Nuxt 3 어댑터
- [x] OpenAPI 3.0 내보내기
- [x] Postman Collection 내보내기
- [x] JSDoc 스캐폴딩 CLI
- [x] CI diff 모드
- [x] Watch 모드
- [x] 검색, 메서드 필터, 통계 대시보드
- [ ] Vue Router 사용처 추적 (route config 기반)
- [ ] VS Code 익스텐션 (인라인 코드렌즈)
- [ ] Markdown 내보내기

---

## 기여하기

기여를 환영합니다! 시작 전에 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽어주세요.

---

## 라이선스

MIT
