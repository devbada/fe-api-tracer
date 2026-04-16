# Phase 5 — HTML 문서 고도화 (HTML UX)

> **목표**: 생성된 HTML 문서의 사용성 향상 — 검색, 필터, 통계.  
> **선행 조건**: 없음 (독립 진행 가능, Phase 3과 병렬 가능)

---

## 현재 상태

`html-generator.ts`는 이미 완성도 높은 인터랙티브 HTML을 생성하지만 다음이 없음:
- 엔드포인트 검색 기능
- HTTP 메서드별 필터
- 서버/클라이언트 간 URL 매칭 표시
- 전체 통계 대시보드

---

## Feature 5-1: 검색 기능

### 대상 파일
- `scripts/lib/html-generator.ts` (수정)

### 작업 내용

사이드바 상단에 검색 입력 필드 추가, 실시간 필터링.

#### HTML 추가

```html
<div class="search-wrap">
  <input type="text" id="search" placeholder="URL, 메서드명, 파라미터 검색..." />
  <kbd>/</kbd>
</div>
```

#### JS 로직

```javascript
const searchInput = document.getElementById('search');
searchInput.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.route-item[data-tab="' + curTab + '"]').forEach(el => {
    const text = el.textContent.toLowerCase();
    el.style.display = text.includes(q) ? '' : 'none';
  });
  // 그룹 라벨도 숨김 처리 (하위 항목이 모두 숨겨지면)
});

// 키보드 단축키
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === 'Escape') searchInput.blur();
});
```

#### CSS 추가

```css
.search-wrap{padding:10px 18px;border-bottom:0.5px solid var(--bd);display:flex;align-items:center;gap:8px}
.search-wrap input{flex:1;padding:7px 10px;border:1px solid var(--bd);border-radius:6px;background:var(--bg);color:var(--tx);font-size:13px;outline:none}
.search-wrap input:focus{border-color:#378ADD}
.search-wrap kbd{font-size:11px;padding:2px 6px;border:1px solid var(--bd);border-radius:3px;color:var(--tx3);background:var(--bg)}
```

### 검색 대상
- URL 경로
- HTTP 메서드명
- 함수명 (`functionName`)
- 파라미터명
- 설명 텍스트

### 검증 기준
- `/user` 입력 시 URL에 `user`가 포함된 항목만 표시
- `POST` 입력 시 POST 메서드 항목만 표시
- `/` 키로 검색창 포커스, `Esc`로 해제

---

## Feature 5-2: 메서드별 필터

### 대상 파일
- `scripts/lib/html-generator.ts` (수정)

### 작업 내용

사이드바 탭 아래에 메서드 토글 버튼 추가.

#### HTML 추가

```html
<div class="method-filters" id="method-filters">
  <button class="method-btn active" data-method="ALL" onclick="toggleMethodFilter('ALL')">전체</button>
  <button class="method-btn active" data-method="GET" onclick="toggleMethodFilter('GET')">GET</button>
  <button class="method-btn active" data-method="POST" onclick="toggleMethodFilter('POST')">POST</button>
  <button class="method-btn active" data-method="PUT" onclick="toggleMethodFilter('PUT')">PUT</button>
  <button class="method-btn active" data-method="DELETE" onclick="toggleMethodFilter('DELETE')">DELETE</button>
  <button class="method-btn active" data-method="PATCH" onclick="toggleMethodFilter('PATCH')">PATCH</button>
</div>
```

#### JS 로직

```javascript
const activeFilters = new Set(['GET','POST','PUT','DELETE','PATCH','ALL']);

function toggleMethodFilter(method) {
  if (method === 'ALL') {
    // 전체 토글
    const allActive = activeFilters.size === 6;
    if (allActive) activeFilters.clear();
    else ['GET','POST','PUT','DELETE','PATCH','ALL'].forEach(m => activeFilters.add(m));
  } else {
    if (activeFilters.has(method)) activeFilters.delete(method);
    else activeFilters.add(method);
  }
  applyFilters();
}

function applyFilters() {
  document.querySelectorAll('.route-item').forEach(el => {
    const method = el.querySelector('[style*="background"]')?.textContent?.trim();
    el.style.display = activeFilters.has(method) ? '' : 'none';
  });
  // 버튼 active 상태 업데이트
  document.querySelectorAll('.method-btn').forEach(btn => {
    btn.classList.toggle('active', activeFilters.has(btn.dataset.method));
  });
}
```

### 검증 기준
- GET만 활성화 시 GET 엔드포인트만 표시
- 검색과 필터가 동시 적용됨 (AND 조건)

---

## Feature 5-3: 상세 정보 확장

### 대상 파일
- `scripts/lib/html-generator.ts` (수정)
- `scripts/lib/client-api-scanner.ts` (returns 추출 개선)

### 작업 내용

#### 5-3a: 클라이언트 API returns 타입 표시

현재 `ClientApiEntry.returns`가 항상 `null`. HTTP 호출의 제네릭 타입에서 추출.

```typescript
// this.http.get<UserResponse>('/api/user')  ← 제네릭 타입 추출
function extractReturnType(callExpr: CallExpression): ReturnsInfo | null {
  const typeArgs = callExpr.getTypeArguments();
  if (typeArgs.length === 0) return null;
  return {
    type: typeArgs[0].getText(),
    description: '',
  };
}
```

#### 5-3b: 파일 경로 복사 기능

사용처 트리에서 파일 경로 클릭 시 클립보드에 복사.

```javascript
function copyPath(text) {
  navigator.clipboard.writeText(text).then(() => {
    // 토스트 메시지 표시
  });
}
```

#### 5-3c: 서버/클라이언트 URL 매칭

같은 URL이 서버 라우트와 클라이언트 호출 양쪽에 존재할 때 연결 표시.

```html
<div class="matched-badge" title="서버 라우트에서도 확인됨">
  서버 라우트 연결됨
</div>
```

---

## Feature 5-4: 통계 대시보드

### 대상 파일
- `scripts/lib/html-generator.ts` (수정)

### 작업 내용

메인 패널의 초기 상태(← 왼쪽에서 항목을 선택하세요)를 통계 대시보드로 교체.

#### 표시 항목
- 총 서버 라우트 수 / 클라이언트 호출 수
- HTTP 메서드별 분포 (수평 막대 차트, 순수 CSS)
- 그룹별 API 카운트
- 사용처 없는 API 목록 (위험 표시)
- 마지막 생성 시간

#### 구현 방식

```typescript
function statsPanel(serverEntries: ApiEntry[], clientEntries: ClientApiEntry[]): string {
  const methodCounts = countByMethod(serverEntries, clientEntries);
  const groupCounts = countByGroup(serverEntries, clientEntries);
  const orphanApis = clientEntries.filter(e =>
    !e.usageChain || (e.usageChain.directCallers.length === 0 && e.usageChain.pageCallers.length === 0)
  );

  return `
    <div class="stats-dashboard">
      <div class="stats-header">
        <h2>API 개요</h2>
        <p>서버 라우트 ${serverEntries.length}개 · 클라이언트 호출 ${clientEntries.length}개</p>
      </div>
      <div class="stats-grid">
        ${methodBarChart(methodCounts)}
        ${groupList(groupCounts)}
        ${orphanList(orphanApis)}
      </div>
    </div>`;
}
```

### 검증 기준
- HTML 첫 로드 시 대시보드 표시
- 사이드바 항목 클릭 시 대시보드 숨김 → 상세 패널 표시
- 사용처 없는 API가 목록에 표시됨

---

## 의존성 그래프

```
Feature 5-1 (검색)          ← 독립
Feature 5-2 (메서드 필터)    ← 독립
Feature 5-3 (상세 정보)      ← 일부 client-api-scanner 수정 필요
Feature 5-4 (통계 대시보드)   ← 독립
```

모두 병렬 진행 가능.

---

## 완료 기준 (DoD)

- [ ] 검색으로 URL, 메서드, 파라미터명 기반 실시간 필터링 가능
- [ ] 메서드별 토글 필터 동작
- [ ] 클라이언트 API의 returns 타입 표시
- [ ] 대시보드에서 전체 API 통계 확인 가능
- [ ] 사용처 없는 API 목록이 대시보드에 표시됨
