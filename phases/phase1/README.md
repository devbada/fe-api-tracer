# Phase 1 — 설정 시스템 연동 (Config Integration)

> **목표**: `config.ts`가 이미 완성되어 있으나 파이프라인 어디에도 주입되지 않음. 모든 하드코딩을 config 기반으로 전환.

---

## 현재 문제점

`config.ts`에 `loadConfig()`, `defineConfig()`, 인터페이스(`ApiTracerConfig`)가 모두 정의되어 있지만, `generate-api-docs.ts`를 포함한 어떤 모듈에서도 import하지 않고 있다. 각 모듈은 값을 하드코딩으로 사용 중이다.

| 모듈 | 하드코딩 항목 |
|------|-------------|
| `generate-api-docs.ts` | 출력 경로 `docs/api.html`, 프리셋 없음, CLI 인자 없음 |
| `client-api-scanner.ts` | HTTP 패턴 `this.http` 고정, API 파일 패턴 `*.api.ts` 고정 |
| `model-resolver.ts` | 데코레이터명 `Attribute`, `IsNotEmpty`, `IsNotBlank` 고정 |
| `usage-tracer.ts` | alias `@/` → `src/` 고정, shared 경로 `src/shared/` 고정 |

---

## Feature 1-1: CLI 인자 파싱 및 config 로딩

### 대상 파일
- `scripts/generate-api-docs.ts` (수정)

### 작업 내용

1. `process.argv`에서 `--env`, `--output`, `--root` 파싱
   - 외부 라이브러리 없이 직접 구현 (minimist 수준이면 충분)
2. `loadConfig(projectRoot, preset)` 호출하여 `Required<ApiTracerConfig>` 획득
3. `OUTPUT_DIR`, `OUTPUT_FILE` 상수 제거 → `config.output` 사용
4. config 객체를 각 모듈 함수에 전달하는 구조로 변경

### Before → After

```typescript
// ❌ Before
const PROJECT_ROOT = process.cwd();
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'docs');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'api.html');

// ✅ After
const args = parseCliArgs(process.argv.slice(2));
const PROJECT_ROOT = args.root ?? process.cwd();
const config = loadConfig(PROJECT_ROOT, args.env);
const OUTPUT_FILE = path.resolve(PROJECT_ROOT, config.output);
```

### 검증 기준
- `--env ci` 플래그로 프리셋 전환 가능
- `--output custom/path.html` 플래그로 출력 경로 변경 가능
- 인자 없이 실행 시 기존과 동일하게 동작 (하위 호환)

---

## Feature 1-2: httpClient 패턴 config 주입

### 대상 파일
- `scripts/lib/client-api-scanner.ts` (수정)
- `scripts/generate-api-docs.ts` (시그니처 변경)

### 작업 내용

1. `scanClientApiCalls(projectRoot)` → `scanClientApiCalls(projectRoot, config)` 시그니처 변경
2. `parseClientFile` 내부의 `'this.http'` 하드코딩 제거:

```typescript
// ❌ Before (client-api-scanner.ts:91)
if (!content.includes('this.http')) return [];

// ✅ After
const patterns = config.httpClient.patterns ?? ['this.http'];
if (!patterns.some(p => content.includes(p))) return [];
```

3. PropertyAccessExpression 매칭도 동적으로 변경:

```typescript
// ❌ Before (client-api-scanner.ts:105)
if (!propAccess.getExpression().getText().toLowerCase().includes('http')) return;

// ✅ After
const exprText = propAccess.getExpression().getText();
if (!patterns.some(p => exprText.includes(p.split('.').pop()!))) return;
```

### 검증 기준
- `config.httpClient.patterns: ['this.axios']`로 설정 시 `this.axios.get()` 패턴 감지
- 기본값(`this.http`)으로 설정 시 기존과 동일 동작

---

## Feature 1-3: apiDirs glob 패턴 적용

### 대상 파일
- `scripts/lib/client-api-scanner.ts` (수정)

### 작업 내용

1. `findApiFiles()` 함수의 `*.api.ts` 하드코딩 → `config.apiDirs` glob 기반 탐색
2. glob 패턴 매칭을 위해 `minimatch` 또는 간단한 glob 유틸 도입

```typescript
// ❌ Before
function findApiFiles(projectRoot: string): string[] {
  // src/ 하위 *.api.ts 고정 탐색
}

// ✅ After
function findApiFiles(projectRoot: string, apiDirs: string[]): string[] {
  // config.apiDirs의 각 glob 패턴으로 탐색
  // 예: ['src/domain/**/api', 'src/shared/api']
}
```

### 검증 기준
- `apiDirs: ['src/services/**/api']` 설정 시 해당 경로만 스캔
- 기본값 동작 유지

---

## Feature 1-4: 데코레이터 설정 config 주입

### 대상 파일
- `scripts/lib/model-resolver.ts` (수정)

### 작업 내용

1. 모듈 수준 config 주입 함수 추가 또는 파라미터 전달 방식 선택
2. `getAttributeLabel()` 내부의 `'Attribute'` → `config.decorators.label` 배열 순회
3. `isRequired()` 내부의 `'IsNotEmpty'`, `'IsNotBlank'` → `config.decorators.required` 배열

```typescript
// ❌ Before (model-resolver.ts:49)
const attrDecorator = prop.getDecorators().find((d) => d.getName() === 'Attribute');

// ✅ After
const labelDecorators = config.decorators.label ?? ['Attribute'];
const attrDecorator = prop.getDecorators().find((d) => labelDecorators.includes(d.getName()));
```

### 검증 기준
- `decorators.label: ['ApiProperty']` 설정 시 NestJS 스타일 데코레이터 인식
- 기본값 동작 유지

---

## Feature 1-5: 사용처 추적 config 주입

### 대상 파일
- `scripts/lib/usage-tracer.ts` (수정)

### 작업 내용

1. `resolveAlias()` 함수의 하드코딩된 `@/`, `@domain/` 등 제거 → `config.alias` 맵 기반

```typescript
// ❌ Before (usage-tracer.ts:27-33)
if (importPath.startsWith('@/')) {
  base = path.join(projectRoot, 'src', importPath.slice(2));
} else if (importPath.startsWith('@') && ...) {
  base = path.join(projectRoot, 'src', importPath.slice(1));
}

// ✅ After
for (const [aliasKey, aliasValue] of Object.entries(config.alias)) {
  if (importPath.startsWith(aliasKey)) {
    base = path.join(projectRoot, aliasValue, importPath.slice(aliasKey.length));
    break;
  }
}
```

2. `isPage()` 함수의 패턴 → `config.trace.pagePattern` 사용
3. shared 디렉토리 제외 로직 → `config.trace.sharedDirs` 사용

### 검증 기준
- 커스텀 alias(`@core/` → `./src/core/`) 설정 시 정상 resolve
- `trace.sharedDirs: ['src/common']` 설정 시 해당 디렉토리 제외

---

## Feature 1-6: framework 자동 감지

### 대상 파일
- 신규 `scripts/lib/framework-detector.ts`
- `scripts/generate-api-docs.ts` (수정)

### 작업 내용

```typescript
export function detectFramework(projectRoot: string): Framework {
  if (fs.existsSync(path.join(projectRoot, 'nuxt.config.ts'))) return 'nuxt';
  if (fs.existsSync(path.join(projectRoot, 'next.config.js')) ||
      fs.existsSync(path.join(projectRoot, 'next.config.mjs')) ||
      fs.existsSync(path.join(projectRoot, 'next.config.ts'))) {
    // App Router vs Pages Router 판별
    const hasAppDir = fs.existsSync(path.join(projectRoot, 'app'));
    const hasRouteFile = /* app/**/route.ts 존재 여부 */;
    if (hasAppDir && hasRouteFile) return 'nextjs-app';
    return 'nextjs-pages';
  }
  if (fs.existsSync(path.join(projectRoot, 'vite.config.ts'))) {
    // vue vs react 판별
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
    if (pkg.dependencies?.vue) return 'vue';
    return 'react';
  }
  return 'nextjs-pages'; // fallback
}
```

### 검증 기준
- `config.framework === 'auto'`일 때 프로젝트 파일 기반 자동 감지
- `config.framework`가 명시적으로 지정되면 감지 로직 스킵

---

## 의존성 그래프

```
Feature 1-1 (CLI + config 로딩)
  ├── Feature 1-2 (httpClient 주입)
  ├── Feature 1-3 (apiDirs 주입)
  ├── Feature 1-4 (decorators 주입)
  ├── Feature 1-5 (trace config 주입)
  └── Feature 1-6 (framework 감지)
```

Feature 1-1을 먼저 완료한 뒤, 1-2 ~ 1-6은 병렬 진행 가능.

---

## 완료 기준 (DoD)

- [ ] `generate-api-docs.ts`가 `loadConfig()`를 호출하여 config 객체를 구성한다
- [ ] `--env`, `--output`, `--root` CLI 인자가 동작한다
- [ ] 모든 모듈에서 하드코딩된 값이 config 기반으로 교체되었다
- [ ] 인자/설정 없이 실행 시 기존과 100% 동일하게 동작한다 (하위 호환)
- [ ] `fe-api-tracer.config.ts` 파일로 커스텀 설정 적용이 가능하다
