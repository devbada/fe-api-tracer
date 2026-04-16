# fe-api-tracer — 기능주도개발(FDD) Phase 계획서

> 현재 코드 분석 기준일: 2026-04-15  
> 우선순위: 기존 코드의 안정화 → 설정 연동 → 프레임워크 확장 → 내보내기 → DX 도구

각 Phase의 상세 가이드는 `phases/` 폴더를 참조하세요:

| Phase | 주제 | 상세 문서 |
|:-----:|------|-----------|
| 1 | 설정 시스템 연동 | [`phases/phase1/README.md`](phases/phase1/README.md) |
| 2 | 프레임워크 어댑터 아키텍처 | [`phases/phase2/README.md`](phases/phase2/README.md) |
| 3 | 클라이언트 스캐너 고도화 | [`phases/phase3/README.md`](phases/phase3/README.md) |
| 4 | 내보내기 포맷 확장 | [`phases/phase4/README.md`](phases/phase4/README.md) |
| 5 | HTML 문서 고도화 | [`phases/phase5/README.md`](phases/phase5/README.md) |
| 6 | DX 도구 | [`phases/phase6/README.md`](phases/phase6/README.md) |
| 7 | 프로젝트 구조화 및 품질 | [`phases/phase7/README.md`](phases/phase7/README.md) |

---

## 현재 구현 상태 요약

| 모듈 | 파일 | 상태 | 비고 |
|------|------|:----:|------|
| CLI 진입점 | `generate-api-docs.ts` | ⚠️ 부분 | config.ts 미연동, CLI 인자 파싱 없음 |
| Pages Router 스캔 | `file-scanner.ts` | ✅ 완료 | `pages/api/**` 정상 동작 |
| AST 파서 | `ast-parser.ts` | ✅ 완료 | JSDoc + HTTP 메서드 추출 |
| 클라이언트 스캔 | `client-api-scanner.ts` | ⚠️ 부분 | `this.http` 하드코딩, config 미연동 |
| 모델 리졸버 | `model-resolver.ts` | ⚠️ 부분 | 데코레이터명 하드코딩, config 미연동 |
| 사용처 추적 | `usage-tracer.ts` | ⚠️ 부분 | alias 하드코딩, sharedDirs config 미연동 |
| HTML 생성기 | `html-generator.ts` | ✅ 완료 | 검색/필터 기능 없음 |
| 설정 시스템 | `config.ts` | ✅ 완료 | 정의만 존재, 실제 파이프라인에 주입 안 됨 |

---

## Phase 1 — 설정 시스템 연동 (Config Integration)

> **목표**: config.ts가 이미 완성되어 있으나 파이프라인 어디에도 주입되지 않음. 모든 하드코딩을 config 기반으로 전환.

### Feature 1-1: CLI 인자 파싱 및 config 로딩

- **파일**: `generate-api-docs.ts`
- **작업 내용**:
  - `process.argv`에서 `--env`, `--output`, `--root` 파싱 (minimist 또는 직접 구현)
  - `loadConfig(projectRoot, preset)` 호출하여 `Required<ApiTracerConfig>` 획득
  - `OUTPUT_DIR`, `OUTPUT_FILE` 하드코딩 제거 → `config.output` 사용
- **영향 범위**: `generate-api-docs.ts`
- **의존성**: 없음

### Feature 1-2: httpClient 패턴 config 주입

- **파일**: `client-api-scanner.ts`
- **작업 내용**:
  - `scanClientApiCalls(projectRoot)` → `scanClientApiCalls(projectRoot, config)` 시그니처 변경
  - `parseClientFile` 내부의 `'this.http'` 하드코딩 → `config.httpClient.patterns` 배열 순회
  - `HTTP_METHODS_MAP` 키를 `config.httpClient.methods`에서 동적 생성
- **영향 범위**: `client-api-scanner.ts`, `generate-api-docs.ts`
- **의존성**: Feature 1-1

### Feature 1-3: apiDirs glob 패턴 적용

- **파일**: `client-api-scanner.ts`
- **작업 내용**:
  - `findApiFiles()` 내부의 `*.api.ts` 하드코딩 → `config.apiDirs` glob 패턴 기반 탐색
  - glob 라이브러리 도입 또는 minimatch 활용
- **영향 범위**: `client-api-scanner.ts`
- **의존성**: Feature 1-1

### Feature 1-4: 데코레이터 설정 config 주입

- **파일**: `model-resolver.ts`
- **작업 내용**:
  - `resolveModelParams(typeText)` → `resolveModelParams(typeText, config)` 시그니처 변경
  - `'Attribute'` 하드코딩 → `config.decorators.label` 배열
  - `'IsNotEmpty'`, `'IsNotBlank'` 하드코딩 → `config.decorators.required` 배열
- **영향 범위**: `model-resolver.ts`, `client-api-scanner.ts`
- **의존성**: Feature 1-1

### Feature 1-5: 사용처 추적 config 주입

- **파일**: `usage-tracer.ts`
- **작업 내용**:
  - `resolveAlias()` 내부의 `@/`, `@domain/` 하드코딩 → `config.alias` 맵 기반 동적 resolve
  - `config.trace.exclude` 심볼 제외 로직 반영
  - `config.trace.sharedDirs` 기반 2단계 추적 제외 디렉토리 동적 처리
  - `config.trace.queryPattern`, `config.trace.pagePattern` 반영
- **영향 범위**: `usage-tracer.ts`, `client-api-scanner.ts`
- **의존성**: Feature 1-1

### Feature 1-6: framework 자동 감지

- **파일**: `generate-api-docs.ts` (또는 신규 `framework-detector.ts`)
- **작업 내용**:
  - `config.framework === 'auto'`일 때 프로젝트 루트 파일 기반 자동 감지
  - `nuxt.config.ts` → nuxt, `next.config.js` → nextjs-pages/app, `vite.config.ts` + vue → vue
  - App Router 판별: `app/` 디렉토리 + `route.ts` 존재 여부
- **영향 범위**: `generate-api-docs.ts`
- **의존성**: Feature 1-1

---

## Phase 2 — 프레임워크 어댑터 아키텍처 (Adapter Pattern)

> **목표**: 현재 Next.js Pages Router에 결합된 로직을 어댑터 패턴으로 분리하여 다중 프레임워크 지원 기반 마련.

### Feature 2-1: FrameworkAdapter 인터페이스 정의

- **파일**: 신규 `scripts/lib/adapters/types.ts`
- **작업 내용**:
  ```typescript
  export interface FrameworkAdapter {
    name: string;
    detect(projectRoot: string): boolean;
    scanApiRoutes(projectRoot: string): RouteFile[];
    parseRouteFile(filePath: string): ParsedEndpoint;
  }
  ```
- **영향 범위**: 신규 파일
- **의존성**: 없음

### Feature 2-2: Next.js Pages Router 어댑터 추출

- **파일**: 신규 `scripts/lib/adapters/nextjs-pages.ts`
- **작업 내용**:
  - 기존 `file-scanner.ts`의 `scanApiRoutes()` → Pages Router 어댑터로 이동
  - 기존 `ast-parser.ts`의 `req.method` 비교, switch 패턴 → Pages Router 전용
  - `detect()`: `next.config.js` 존재 + `pages/api/` 존재
- **영향 범위**: `file-scanner.ts`, `ast-parser.ts`를 리팩토링
- **의존성**: Feature 2-1

### Feature 2-3: Next.js App Router 어댑터

- **파일**: 신규 `scripts/lib/adapters/nextjs-app.ts`
- **작업 내용**:
  - `app/**/route.ts` 파일 스캔 로직 구현
  - `export async function GET/POST/PUT/DELETE` 패턴 파싱 (ast-parser에 이미 부분 구현됨)
  - URL 변환: `app/api/user/[id]/route.ts` → `/api/user/:id`
  - `detect()`: `app/` 디렉토리 + `route.ts` 파일 존재
- **영향 범위**: 신규 파일
- **의존성**: Feature 2-1

### Feature 2-4: Nuxt 3 어댑터

- **파일**: 신규 `scripts/lib/adapters/nuxt.ts`
- **작업 내용**:
  - `server/api/**/*.ts` 스캔
  - `defineEventHandler` 패턴 AST 파싱
  - HTTP 메서드 추출: 파일명 접미사 (`user.get.ts` → GET) 또는 `getMethod(event)` 패턴
  - `detect()`: `nuxt.config.ts` 존재
- **영향 범위**: 신규 파일
- **의존성**: Feature 2-1

### Feature 2-5: 어댑터 레지스트리 및 자동 선택

- **파일**: 신규 `scripts/lib/adapters/registry.ts`, `generate-api-docs.ts` 수정
- **작업 내용**:
  - 등록된 어댑터 순회 → `detect()` → 첫 매칭 어댑터 사용
  - `config.framework !== 'auto'`면 직접 지정된 어댑터 사용
  - `generate-api-docs.ts`의 서버 라우트 스캔 로직을 어댑터 호출로 교체
- **영향 범위**: `generate-api-docs.ts`
- **의존성**: Feature 2-2, 2-3, 2-4

---

## Phase 3 — 클라이언트 스캐너 고도화 (Scanner Enhancement)

> **목표**: 다양한 HTTP 클라이언트 패턴 인식 및 Vue/React 프로젝트 대응.

### Feature 3-1: 다중 HTTP 클라이언트 패턴 인식

- **파일**: `client-api-scanner.ts`
- **작업 내용**:
  - `this.http` 외에 `this.axios`, `apiClient.get()`, `request.post()` 등 인식
  - `config.httpClient.patterns` 배열 기반 동적 매칭
  - PropertyAccessExpression 탐색 시 patterns 배열 순회
- **영향 범위**: `client-api-scanner.ts`
- **의존성**: Phase 1 (Feature 1-2)

### Feature 3-2: fetch/axios 직접 호출 인식

- **파일**: `client-api-scanner.ts`
- **작업 내용**:
  - `fetch('/api/user')`, `axios.get('/api/user')` 패턴 감지
  - URL이 상대경로(`/api/...`)일 때만 API 호출로 판별
  - 함수 래퍼 패턴: `const fetchUser = () => fetch(...)` 인식
- **영향 범위**: `client-api-scanner.ts`
- **의존성**: Feature 3-1

### Feature 3-3: Vue Composition API 패턴 인식

- **파일**: `client-api-scanner.ts` 또는 신규 스캐너
- **작업 내용**:
  - `useFetch`, `useAsyncData` (Nuxt) 패턴 감지
  - `composables/` 디렉토리의 API 호출 함수 인식
- **영향 범위**: `client-api-scanner.ts`
- **의존성**: Feature 3-1

### Feature 3-4: React Query / TanStack Query 패턴 인식

- **파일**: `client-api-scanner.ts`
- **작업 내용**:
  - `useQuery`, `useMutation` 호출에서 queryFn 내부의 API 호출 추출
  - query key와 API URL 연결
- **영향 범위**: `client-api-scanner.ts`
- **의존성**: Feature 3-1

---

## Phase 4 — 내보내기 포맷 확장 (Export Formats)

> **목표**: HTML 외 다양한 표준 포맷으로 API 문서 내보내기.

### Feature 4-1: 출력 포맷 추상화

- **파일**: 신규 `scripts/lib/exporters/types.ts`
- **작업 내용**:
  ```typescript
  export interface DocExporter {
    format: string;
    extension: string;
    generate(serverEntries: ApiEntry[], clientEntries: ClientApiEntry[], meta: DocMeta): string;
  }
  ```
  - `config.output` 확장자 기반 자동 포맷 선택
  - 또는 `--format html|openapi|postman` CLI 옵션 추가
- **영향 범위**: `generate-api-docs.ts`, 신규 파일
- **의존성**: Phase 1

### Feature 4-2: OpenAPI (Swagger) 내보내기

- **파일**: 신규 `scripts/lib/exporters/openapi-exporter.ts`
- **작업 내용**:
  - 서버 라우트 + 클라이언트 호출 → OpenAPI 3.0 스키마 변환
  - `ParamInfo[]` → `parameters` / `requestBody` 매핑
  - `ReturnsInfo` → `responses` 매핑
  - YAML/JSON 출력 (`js-yaml` 활용)
- **영향 범위**: 신규 파일
- **의존성**: Feature 4-1

### Feature 4-3: Postman Collection 내보내기

- **파일**: 신규 `scripts/lib/exporters/postman-exporter.ts`
- **작업 내용**:
  - Postman Collection v2.1 스키마 준수
  - 그룹 → 폴더, 엔드포인트 → request item 매핑
  - 파라미터 → body/query 자동 배치
  - 환경 변수 `{{baseUrl}}` 템플릿 지원
- **영향 범위**: 신규 파일
- **의존성**: Feature 4-1

---

## Phase 5 — HTML 문서 고도화 (HTML UX)

> **목표**: 생성된 HTML 문서의 사용성 향상.

### Feature 5-1: 검색 기능

- **파일**: `html-generator.ts`
- **작업 내용**:
  - 사이드바 상단 검색 입력 필드 추가
  - URL, 메서드명, 파라미터명, 설명 텍스트 기반 실시간 필터링
  - 키보드 단축키: `/` 또는 `Ctrl+K`로 검색 포커스
- **영향 범위**: `html-generator.ts`
- **의존성**: 없음

### Feature 5-2: 메서드별 필터

- **파일**: `html-generator.ts`
- **작업 내용**:
  - GET / POST / PUT / DELETE / PATCH 토글 버튼
  - 활성화된 메서드만 사이드바에 표시
- **영향 범위**: `html-generator.ts`
- **의존성**: 없음

### Feature 5-3: 상세 정보 확장

- **파일**: `html-generator.ts`
- **작업 내용**:
  - 클라이언트 API의 `returns` 타입 표시 (현재 null 고정)
  - 사용처 트리에서 파일 경로 클릭 시 전체 경로 복사
  - 서버/클라이언트 엔드포인트 간 URL 매칭 표시 (같은 API를 서버+클라이언트 양쪽에서 볼 때)
- **영향 범위**: `html-generator.ts`, `client-api-scanner.ts`
- **의존성**: 없음

### Feature 5-4: 통계 대시보드

- **파일**: `html-generator.ts`
- **작업 내용**:
  - 총 API 수, 메서드별 분포, 사용처 없는 API 목록
  - 그룹별 API 카운트 차트 (순수 CSS/SVG 기반)
- **영향 범위**: `html-generator.ts`
- **의존성**: 없음

---

## Phase 6 — DX 도구 (Developer Experience)

> **목표**: 개발자가 일상적으로 사용하는 워크플로우 지원.

### Feature 6-1: JSDoc 자동 스캐폴딩 CLI

- **파일**: 신규 `scripts/scaffold-jsdoc.ts`
- **작업 내용**:
  - JSDoc이 없는 API 핸들러 함수 탐색
  - `@param`, `@returns` 템플릿 자동 삽입
  - `--dry-run` 모드: 변경 없이 대상 파일 목록만 출력
  - `--interactive` 모드: 파일별 확인 후 삽입
- **영향 범위**: 신규 파일
- **의존성**: Phase 1

### Feature 6-2: CI diff 모드

- **파일**: 신규 `scripts/diff-api.ts`
- **작업 내용**:
  - 기존 `docs/api.json` (중간 데이터)와 현재 스캔 결과 비교
  - 추가/삭제/변경된 엔드포인트 목록 출력
  - CI에서 PR 코멘트로 자동 게시 가능한 Markdown 포맷
  - `--fail-on-breaking` 플래그: 삭제된 엔드포인트 발견 시 exit code 1
- **영향 범위**: 신규 파일, `generate-api-docs.ts` (중간 JSON 저장 옵션)
- **의존성**: Phase 1, Feature 4-1 (중간 데이터 포맷)

### Feature 6-3: Watch 모드

- **파일**: 신규 로직 in `generate-api-docs.ts`
- **작업 내용**:
  - `--watch` 플래그: `*.api.ts`, `pages/api/**` 변경 감지 시 자동 재생성
  - `chokidar` 또는 `fs.watch` 활용
  - debounce 적용 (300ms)
- **영향 범위**: `generate-api-docs.ts`
- **의존성**: Phase 1

---

## Phase 7 — 프로젝트 구조화 및 품질 (Structure & Quality)

> **목표**: 장기 유지보수를 위한 코드 품질 확보.

### Feature 7-1: 테스트 프레임워크 구축

- **파일**: 신규 `__tests__/` 디렉토리
- **작업 내용**:
  - Jest 또는 Vitest 설정
  - 핵심 모듈별 단위 테스트:
    - `file-scanner.ts`: 경로 변환 로직
    - `ast-parser.ts`: 다양한 핸들러 패턴 파싱
    - `model-resolver.ts`: 데코레이터 추출
    - `usage-tracer.ts`: import 인덱스 빌드 + 추적
  - 테스트용 fixture 프로젝트 (`__tests__/fixtures/`)
- **영향 범위**: 신규 디렉토리
- **의존성**: 없음 (언제든 시작 가능)

### Feature 7-2: packages/ 모노레포 리팩토링

- **파일**: 전체 구조 변경
- **작업 내용**:
  - CONTRIBUTING.md에 명시된 목표 구조로 전환:
    ```
    packages/
      core/       → file-scanner, ast-parser, model-resolver, usage-tracer, html-generator
      adapters/   → nextjs-pages, nextjs-app, nuxt, vue
      cli/        → generate-api-docs.ts
    ```
  - npm workspaces 또는 turborepo 설정
  - 각 패키지별 독립 빌드/테스트
- **영향 범위**: 전체
- **의존성**: Phase 2 (어댑터 분리 완료 후)

### Feature 7-3: npm 패키지 발행 준비

- **파일**: `package.json`, `tsconfig.json`, 빌드 스크립트
- **작업 내용**:
  - `bin` 필드 설정 (`fe-api-tracer` CLI 명령)
  - TypeScript 컴파일 → `dist/` 출력
  - `.npmignore` 또는 `files` 필드 설정
  - `defineConfig` re-export 설정
- **영향 범위**: 프로젝트 설정 파일
- **의존성**: Feature 7-2

---

## 실행 순서 권장

```
Phase 1 (설정 연동)  ← 모든 Phase의 기반, 최우선
  ↓
Phase 2 (어댑터 패턴) ← 프레임워크 확장의 전제조건
  ↓
Phase 3 (스캐너 고도화) + Phase 5 (HTML UX)  ← 병렬 진행 가능
  ↓
Phase 4 (내보내기)   ← Phase 1 완료 후 독립 진행 가능
  ↓
Phase 6 (DX 도구)    ← Phase 1 완료 후 독립 진행 가능
  ↓
Phase 7 (구조화)     ← Phase 2 완료 후 진행 권장, 테스트는 언제든 가능
```

---

## 빠른 참조: 파일별 변경 매핑

| 기존 파일 | 관련 Phase |
|-----------|-----------|
| `generate-api-docs.ts` | 1-1, 1-6, 2-5, 6-2, 6-3 |
| `file-scanner.ts` | 2-2 (어댑터로 이동) |
| `ast-parser.ts` | 2-2, 2-3, 2-4 (어댑터별 분리) |
| `client-api-scanner.ts` | 1-2, 1-3, 3-1, 3-2, 3-3, 3-4 |
| `model-resolver.ts` | 1-4 |
| `usage-tracer.ts` | 1-5 |
| `html-generator.ts` | 5-1, 5-2, 5-3, 5-4 |
| `config.ts` | 1-1 (소비하는 쪽 연결) |

| 신규 파일 | Phase |
|-----------|-------|
| `scripts/lib/adapters/types.ts` | 2-1 |
| `scripts/lib/adapters/nextjs-pages.ts` | 2-2 |
| `scripts/lib/adapters/nextjs-app.ts` | 2-3 |
| `scripts/lib/adapters/nuxt.ts` | 2-4 |
| `scripts/lib/adapters/registry.ts` | 2-5 |
| `scripts/lib/exporters/types.ts` | 4-1 |
| `scripts/lib/exporters/openapi-exporter.ts` | 4-2 |
| `scripts/lib/exporters/postman-exporter.ts` | 4-3 |
| `scripts/scaffold-jsdoc.ts` | 6-1 |
| `scripts/diff-api.ts` | 6-2 |
| `__tests__/` | 7-1 |
