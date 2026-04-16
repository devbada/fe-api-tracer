# Phase 6 — DX 도구 (Developer Experience)

> **목표**: 개발자 일상 워크플로우를 지원하는 CLI 도구 확장.  
> **선행 조건**: Phase 1 완료 (CLI 인자 파싱 기반), Phase 4의 Feature 4-4 (JSON 중간 데이터)

---

## Feature 6-1: JSDoc 자동 스캐폴딩 CLI

### 대상 파일
- 신규 `scripts/scaffold-jsdoc.ts`

### 작업 내용

JSDoc이 없는 API 핸들러 함수에 주석 템플릿을 자동 삽입하는 CLI 명령.

#### 실행 방법

```bash
fe-api-tracer scaffold           # 대화형 모드
fe-api-tracer scaffold --dry-run # 변경 없이 대상만 표시
fe-api-tracer scaffold --auto    # 자동 삽입 (확인 없이)
```

#### 동작 흐름

```
1. 서버 라우트 스캔 (Phase 2 어댑터 활용)
2. 각 핸들러 함수에서 JSDoc 존재 여부 확인
3. JSDoc이 없는 함수 목록 출력
4. 함수 시그니처에서 파라미터 타입 추출
5. JSDoc 템플릿 생성 및 삽입
```

#### 생성 템플릿 예시

```typescript
// Before
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // ...
}

// After
/**
 * TODO: API 설명을 작성해주세요.
 *
 * @param {NextApiRequest} req
 * @param {NextApiResponse} res
 * @returns {void}
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // ...
}
```

#### 구현 핵심

```typescript
import { Project, SyntaxKind } from 'ts-morph';

function findFunctionsWithoutJsDoc(filePath: string): FunctionInfo[] {
  const sourceFile = project.addSourceFileAtPath(filePath);
  const results: FunctionInfo[] = [];

  // default export 함수 검사
  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    const decl = defaultExport.getDeclarations()[0];
    const jsDocs = decl.getChildrenOfKind(SyntaxKind.JSDoc);
    if (jsDocs.length === 0) {
      results.push({
        filePath,
        functionName: 'handler',
        line: decl.getStartLineNumber(),
        params: extractParams(decl),
      });
    }
  }

  return results;
}

function generateJsDocTemplate(info: FunctionInfo): string {
  const paramDocs = info.params
    .map(p => ` * @param {${p.type}} ${p.name}`)
    .join('\n');
  return `/**\n * TODO: API 설명을 작성해주세요.\n *\n${paramDocs}\n * @returns {void}\n */`;
}
```

### 검증 기준
- `--dry-run` 모드에서 파일 변경 없이 대상 목록만 출력
- 이미 JSDoc이 있는 함수는 건너뜀
- 삽입 후 TypeScript 컴파일 에러 없음

---

## Feature 6-2: CI diff 모드

### 대상 파일
- 신규 `scripts/diff-api.ts`

### 작업 내용

이전 스캔 결과(JSON)와 현재 결과를 비교하여 API 변경사항 감지.

#### 실행 방법

```bash
# 기준 JSON 생성 (main 브랜치에서)
fe-api-tracer --format json --output .api-snapshot.json

# 현재 브랜치와 비교
fe-api-tracer diff --base .api-snapshot.json

# CI에서 breaking change 감지 시 실패
fe-api-tracer diff --base .api-snapshot.json --fail-on-breaking
```

#### 출력 포맷 (Markdown — PR 코멘트용)

```markdown
## 🔄 API 변경사항

### ➕ 추가된 엔드포인트 (2건)
- `POST /api/user/invite` — user.api.ts
- `GET /api/settings/theme` — settings.api.ts

### ❌ 삭제된 엔드포인트 (1건) ⚠️ Breaking
- `DELETE /api/user/avatar` — user.api.ts

### ✏️ 변경된 엔드포인트 (1건)
- `PATCH /api/user/profile` — 파라미터 추가: `nickname (string)`

### 📊 요약
| 항목 | 수 |
|------|---|
| 추가 | 2 |
| 삭제 | 1 |
| 변경 | 1 |
| Breaking Changes | 1 |
```

#### 구현 핵심

```typescript
interface ApiSnapshot {
  meta: DocMeta;
  server: SnapshotEntry[];
  client: SnapshotEntry[];
}

interface DiffResult {
  added: SnapshotEntry[];
  removed: SnapshotEntry[];   // breaking change
  changed: ChangedEntry[];
}

function diffSnapshots(base: ApiSnapshot, current: ApiSnapshot): DiffResult {
  const baseMap = new Map(base.client.map(e => [`${e.method} ${e.url}`, e]));
  const currentMap = new Map(current.client.map(e => [`${e.method} ${e.url}`, e]));

  const added = current.client.filter(e => !baseMap.has(`${e.method} ${e.url}`));
  const removed = base.client.filter(e => !currentMap.has(`${e.method} ${e.url}`));
  const changed = findChangedEntries(baseMap, currentMap);

  return { added, removed, changed };
}
```

#### CI 통합 예시 (GitHub Actions)

```yaml
- name: API diff check
  run: |
    git checkout main
    npx fe-api-tracer --format json --output .api-base.json
    git checkout ${{ github.head_ref }}
    npx fe-api-tracer diff --base .api-base.json --fail-on-breaking
```

### 검증 기준
- 엔드포인트 추가/삭제/파라미터 변경 정확히 감지
- `--fail-on-breaking` 플래그로 삭제 감지 시 exit code 1
- 변경 없으면 "변경사항 없음" 메시지

---

## Feature 6-3: Watch 모드

### 대상 파일
- `scripts/generate-api-docs.ts` (수정)

### 작업 내용

파일 변경 감지 시 자동 재생성.

#### 실행 방법

```bash
fe-api-tracer --watch
```

#### 구현 핵심

```typescript
import * as chokidar from 'chokidar';

function startWatchMode(config: Required<ApiTracerConfig>): void {
  const watchPaths = [
    path.join(config.root, 'src/**/*.api.ts'),
    path.join(config.root, 'pages/api/**/*.ts'),
    path.join(config.root, 'app/**/route.ts'),
    path.join(config.root, 'server/api/**/*.ts'),
  ];

  console.log('[api-docs] watch 모드 시작...');

  let debounceTimer: NodeJS.Timeout | null = null;

  const watcher = chokidar.watch(watchPaths, {
    ignored: /node_modules|\.next|dist/,
    persistent: true,
  });

  watcher.on('change', (filePath) => {
    console.log(`[api-docs] 변경 감지: ${filePath}`);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log('[api-docs] 재생성 중...');
      main();  // 기존 main() 재실행
    }, 300);
  });
}
```

#### 의존 라이브러리
- `chokidar` (파일 감시, 선택적 — `fs.watch` fallback 가능)

### 검증 기준
- `*.api.ts` 파일 수정 시 300ms 후 자동 재생성
- 연속 변경 시 debounce 적용 (마지막 변경 후 300ms)
- `Ctrl+C`로 정상 종료

---

## 의존성 그래프

```
Phase 1 (CLI 인자 파싱)
  ├── Feature 6-1 (JSDoc 스캐폴딩)  ← 독립
  ├── Feature 6-3 (Watch 모드)      ← 독립
  └── Phase 4 Feature 4-4 (JSON 내보내기)
        └── Feature 6-2 (CI diff)    ← JSON 스냅샷 필요
```

---

## 완료 기준 (DoD)

- [ ] `fe-api-tracer scaffold` 명령으로 JSDoc 미작성 함수에 템플릿 삽입
- [ ] `fe-api-tracer diff --base snapshot.json`으로 API 변경사항 감지
- [ ] `--fail-on-breaking` 플래그로 CI에서 breaking change 차단
- [ ] `--watch` 모드로 파일 변경 시 자동 재생성
