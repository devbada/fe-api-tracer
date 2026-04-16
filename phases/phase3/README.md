# Phase 3 — 클라이언트 스캐너 고도화 (Scanner Enhancement)

> **목표**: 다양한 HTTP 클라이언트 패턴 인식 및 Vue/React 프로젝트 대응.  
> **선행 조건**: Phase 1 완료 (config.httpClient.patterns 연동 필수)

---

## 현재 문제점

- `client-api-scanner.ts`가 `this.http.메서드()` 패턴만 인식
- `axios.get()`, `fetch()`, `apiClient.post()` 등 일반적인 패턴 미감지
- Vue Composition API(`useFetch`, `useAsyncData`) 미인식
- React Query(`useQuery`, `useMutation`) 내부의 API 호출 미인식

---

## Feature 3-1: 다중 HTTP 클라이언트 패턴 인식

### 대상 파일
- `scripts/lib/client-api-scanner.ts` (수정)

### 작업 내용

Phase 1의 Feature 1-2에서 config 주입이 완료된 상태에서, 다양한 호출 패턴을 실제로 감지하는 로직을 구현.

#### 지원할 패턴 목록

```typescript
// 1. 메서드 체이닝 패턴 (기존)
this.http.post('/api/user', params)
this.axios.get('/api/user')

// 2. 변수 호출 패턴
apiClient.post('/api/user', params)
request.get('/api/user')

// 3. 인스턴스 메서드 패턴
const api = new ApiService();
api.post('/api/user', params)
```

#### 구현 전략

```typescript
function isHttpClientCall(
  propAccess: PropertyAccessExpression,
  patterns: string[]
): boolean {
  const methodName = propAccess.getName().toLowerCase();
  if (!HTTP_METHODS_MAP[methodName]) return false;

  const exprText = propAccess.getExpression().getText();

  // 정확한 패턴 매칭: "this.http", "apiClient" 등
  return patterns.some(pattern => {
    if (pattern.includes('.')) {
      // "this.http" → exprText가 "this.http"와 일치
      return exprText === pattern;
    }
    // "apiClient" → exprText가 "apiClient"와 일치
    return exprText === pattern;
  });
}
```

### 검증 기준
- `this.http.post()`, `apiClient.get()`, `request.delete()` 모두 감지
- config에 없는 패턴은 무시

---

## Feature 3-2: fetch/axios 직접 호출 인식

### 대상 파일
- `scripts/lib/client-api-scanner.ts` (수정)

### 작업 내용

PropertyAccess가 아닌 직접 함수 호출 패턴 감지.

```typescript
// 감지 대상
fetch('/api/user')
fetch('/api/user', { method: 'POST', body: JSON.stringify(params) })
axios('/api/user', { method: 'GET' })
axios.get('/api/user')
axios.post('/api/user', params)
```

#### 구현 전략

```typescript
// CallExpression에서 직접 호출 감지
function detectDirectFetchCall(callExpr: CallExpression): ClientApiEntry | null {
  const callee = callExpr.getExpression();
  const calleeName = callee.getText();

  if (calleeName !== 'fetch' && calleeName !== 'axios') return null;

  const args = callExpr.getArguments();
  if (args.length === 0) return null;

  const url = extractUrl(callExpr);
  if (!url || !url.startsWith('/api')) return null;  // 상대경로 API만

  // method 추출: 2번째 인자의 { method: 'POST' } 또는 기본 GET
  let method: HttpMethod = 'GET';
  if (args.length >= 2) {
    const optText = args[1].getText();
    const methodMatch = optText.match(/method\s*:\s*['"](\w+)['"]/);
    if (methodMatch) method = methodMatch[1].toUpperCase() as HttpMethod;
  }

  return { method, url, /* ... */ };
}
```

### 주의사항
- 외부 API 호출(`https://...`)은 무시 — 내부 API(`/api/...` 또는 상대경로)만 대상
- `fetch`에서 method가 없으면 기본 GET

---

## Feature 3-3: Vue Composition API 패턴 인식

### 대상 파일
- `scripts/lib/client-api-scanner.ts` (수정 또는 신규 스캐너)

### 작업 내용

```typescript
// Nuxt 3 패턴
const { data } = await useFetch('/api/user')
const { data } = await useFetch('/api/user', { method: 'POST', body: params })

// useAsyncData + $fetch
const { data } = await useAsyncData('user', () => $fetch('/api/user'))

// composables 패턴
export const useUser = () => {
  return useFetch('/api/user')
}
```

#### 감지 전략

1. `useFetch()`, `useAsyncData()` 호출의 첫 번째 인자에서 URL 추출
2. `$fetch()` 호출 감지 (Nuxt의 내장 fetch)
3. `composables/` 디렉토리의 함수도 스캔 대상에 포함

```typescript
function detectNuxtFetchCall(callExpr: CallExpression): ClientApiEntry | null {
  const calleeName = callExpr.getExpression().getText();
  if (!['useFetch', '$fetch', 'useAsyncData'].includes(calleeName)) return null;

  if (calleeName === 'useAsyncData') {
    // 2번째 인자(콜백)에서 $fetch 호출 추출
    const callback = callExpr.getArguments()[1];
    // callback 내부의 $fetch 호출 탐색
  }
  // ...
}
```

### 스캔 대상 파일 확장
- 기존: `*.api.ts`만
- 추가: `composables/*.ts`, `*.composable.ts` (config에서 설정 가능)

---

## Feature 3-4: React Query / TanStack Query 패턴 인식

### 대상 파일
- `scripts/lib/client-api-scanner.ts` (수정)

### 작업 내용

```typescript
// useQuery 패턴
const { data } = useQuery({
  queryKey: ['user', id],
  queryFn: () => apiClient.get(`/api/user/${id}`)
})

// useMutation 패턴
const mutation = useMutation({
  mutationFn: (params: CreateUserDto) => apiClient.post('/api/user', params)
})

// 커스텀 훅 패턴
export const useUser = (id: string) => useQuery({
  queryKey: ['user', id],
  queryFn: () => fetch(`/api/user/${id}`).then(r => r.json())
})
```

#### 감지 전략

1. `useQuery`, `useMutation` 호출 감지
2. `queryFn` / `mutationFn` 프로퍼티의 값(콜백)에서 HTTP 호출 추출
3. 이미 Feature 3-1/3-2에서 감지할 수 있는 패턴이면, queryFn 내부에서 재귀 탐색

```typescript
function detectQueryCall(callExpr: CallExpression): ClientApiEntry | null {
  const calleeName = callExpr.getExpression().getText();
  if (!['useQuery', 'useMutation'].includes(calleeName)) return null;

  const args = callExpr.getArguments();
  if (args.length === 0) return null;

  // 객체 인자에서 queryFn/mutationFn 프로퍼티 탐색
  const objArg = args[0];
  if (objArg.getKind() !== SyntaxKind.ObjectLiteralExpression) return null;

  const fnProp = objArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
    .getProperties()
    .find(p => {
      const name = p.getSymbol()?.getName();
      return name === 'queryFn' || name === 'mutationFn';
    });

  if (!fnProp) return null;

  // fnProp 내부에서 HTTP 호출 패턴 재탐색
  const httpCalls = fnProp.getDescendantsOfKind(SyntaxKind.CallExpression);
  // ... 기존 패턴 매칭 로직 재활용
}
```

### 검증 기준
- `useQuery` + `apiClient.get()` 조합에서 URL, 메서드 정상 추출
- `useMutation` + `fetch('/api/...', { method: 'POST' })` 조합 감지
- queryFn이 외부 함수 참조(`queryFn: fetchUser`)인 경우 → 추적 불가 표시 (향후 개선)

---

## 의존성 그래프

```
Phase 1 (Feature 1-2: httpClient config 주입)
  ↓
Feature 3-1 (다중 HTTP 클라이언트)
  ├── Feature 3-2 (fetch/axios 직접 호출)
  ├── Feature 3-3 (Vue Composition API)
  └── Feature 3-4 (React Query / TanStack Query)
```

---

## 완료 기준 (DoD)

- [ ] `this.http`, `apiClient`, `request` 등 config에 정의된 모든 패턴 감지
- [ ] `fetch()`, `axios()` 직접 호출 감지 (상대경로 API만)
- [ ] Vue `useFetch()`, `$fetch()` 패턴 감지
- [ ] React Query `useQuery`/`useMutation` 내부 API 호출 감지
- [ ] 기존 `this.http` 패턴 감지 결과가 변경되지 않음 (하위 호환)
