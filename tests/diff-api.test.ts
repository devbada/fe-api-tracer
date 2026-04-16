import { describe, it, expect } from 'vitest';

// diff-api.ts의 핵심 로직을 직접 테스트하기 위해 인라인으로 구현
// (실제 파일은 CLI 실행용이므로 내부 함수를 직접 import 불가)

interface SnapshotEntry {
  route?: string;
  url?: string;
  method?: string;
  methods?: string[];
  description?: string;
  params?: { name: string; type: string }[];
}

interface DiffResult {
  added: { type: string; key: string }[];
  removed: { type: string; key: string }[];
  changed: { type: string; key: string; field: string }[];
}

function entryKey(entry: SnapshotEntry, type: 'server' | 'client'): string {
  if (type === 'server') {
    return `${(entry.methods ?? []).join(',')} ${entry.route}`;
  }
  return `${entry.method} ${entry.url}`;
}

function computeDiff(
  beforeServer: SnapshotEntry[],
  afterServer: SnapshotEntry[],
  beforeClient: SnapshotEntry[],
  afterClient: SnapshotEntry[]
): DiffResult {
  const result: DiffResult = { added: [], removed: [], changed: [] };

  function diff(before: SnapshotEntry[], after: SnapshotEntry[], type: 'server' | 'client') {
    const bMap = new Map(before.map((e) => [entryKey(e, type), e]));
    const aMap = new Map(after.map((e) => [entryKey(e, type), e]));

    aMap.forEach((_, key) => {
      if (!bMap.has(key)) result.added.push({ type, key });
    });
    bMap.forEach((bEntry, key) => {
      if (!aMap.has(key)) {
        result.removed.push({ type, key });
      } else {
        const aEntry = aMap.get(key)!;
        if ((bEntry.description ?? '') !== (aEntry.description ?? '')) {
          result.changed.push({ type, key, field: 'description' });
        }
        if (JSON.stringify(bEntry.params ?? []) !== JSON.stringify(aEntry.params ?? [])) {
          result.changed.push({ type, key, field: 'params' });
        }
      }
    });
  }

  diff(beforeServer, afterServer, 'server');
  diff(beforeClient, afterClient, 'client');
  return result;
}

describe('diff-api 로직', () => {
  it('동일한 스냅샷에서 변경 없음을 감지해야 한다', () => {
    const entries = [{ route: '/api/users', methods: ['GET'], description: 'Get users' }];
    const result = computeDiff(entries, entries, [], []);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });

  it('새 엔드포인트 추가를 감지해야 한다', () => {
    const before = [{ route: '/api/users', methods: ['GET'] }];
    const after = [
      { route: '/api/users', methods: ['GET'] },
      { route: '/api/posts', methods: ['POST'] },
    ];
    const result = computeDiff(before, after, [], []);
    expect(result.added).toHaveLength(1);
    expect(result.added[0].key).toContain('/api/posts');
  });

  it('삭제된 엔드포인트를 감지해야 한다', () => {
    const before = [
      { route: '/api/users', methods: ['GET'] },
      { route: '/api/posts', methods: ['POST'] },
    ];
    const after = [{ route: '/api/users', methods: ['GET'] }];
    const result = computeDiff(before, after, [], []);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].key).toContain('/api/posts');
  });

  it('설명 변경을 감지해야 한다', () => {
    const before = [{ route: '/api/users', methods: ['GET'], description: 'old desc' }];
    const after = [{ route: '/api/users', methods: ['GET'], description: 'new desc' }];
    const result = computeDiff(before, after, [], []);
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].field).toBe('description');
  });

  it('파라미터 변경을 감지해야 한다', () => {
    const before = [{ route: '/api/users', methods: ['GET'], params: [{ name: 'id', type: 'number' }] }];
    const after = [{ route: '/api/users', methods: ['GET'], params: [{ name: 'id', type: 'string' }] }];
    const result = computeDiff(before, after, [], []);
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].field).toBe('params');
  });

  it('클라이언트 엔트리 diff도 동작해야 한다', () => {
    const bClient = [{ method: 'GET', url: '/api/users' }];
    const aClient = [
      { method: 'GET', url: '/api/users' },
      { method: 'POST', url: '/api/orders' },
    ];
    const result = computeDiff([], [], bClient, aClient);
    expect(result.added).toHaveLength(1);
    expect(result.added[0].key).toContain('/api/orders');
  });
});
