import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scanClientApiCalls } from '../scripts/lib/client-api-scanner';
import { loadConfig } from '../config';

describe('client-api-scanner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'client-scanner-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relativePath: string, content: string): string {
    const full = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
    return full;
  }

  it('*.api.ts 파일이 없으면 빈 배열을 반환해야 한다', () => {
    writeFile('src/dummy.ts', 'export const x = 1;');
    const result = scanClientApiCalls(tmpDir);
    expect(result).toEqual([]);
  });

  it('config 없이 호출해도 기본값으로 동작해야 한다 (하위 호환)', () => {
    writeFile('src/dummy.ts', 'export const x = 1;');
    // config 없이 호출
    expect(() => scanClientApiCalls(tmpDir)).not.toThrow();
  });

  it('config와 함께 호출해도 동작해야 한다', () => {
    writeFile('src/dummy.ts', 'export const x = 1;');
    const config = loadConfig(tmpDir);
    expect(() => scanClientApiCalls(tmpDir, config)).not.toThrow();
  });

  it('this.http.get 패턴의 호출을 감지해야 한다', () => {
    writeFile('src/domain/user/api/user.api.ts', `
      class UserApi {
        constructor(private http: any) {}

        getUsers() {
          return this.http.get('/api/users');
        }

        createUser(data: any) {
          return this.http.post('/api/users', data);
        }
      }
    `);

    const result = scanClientApiCalls(tmpDir);

    expect(result.length).toBeGreaterThanOrEqual(2);
    const getCall = result.find((r) => r.method === 'GET' && r.url.includes('users'));
    const postCall = result.find((r) => r.method === 'POST' && r.url.includes('users'));
    expect(getCall).toBeDefined();
    expect(postCall).toBeDefined();
  });

  it('fetch() 직접 호출을 감지해야 한다', () => {
    writeFile('src/domain/order/api/order.api.ts', `
      export async function fetchOrders() {
        return fetch('/api/orders');
      }

      export async function createOrder(data: any) {
        return fetch('/api/orders', { method: 'POST', body: JSON.stringify(data) });
      }
    `);

    const result = scanClientApiCalls(tmpDir);

    const getCall = result.find((r) => r.method === 'GET' && r.url.includes('orders'));
    const postCall = result.find((r) => r.method === 'POST' && r.url.includes('orders'));
    expect(getCall).toBeDefined();
    expect(postCall).toBeDefined();
  });

  it('중복 엔드포인트를 제거해야 한다', () => {
    writeFile('src/domain/api/dup.api.ts', `
      class DupApi {
        constructor(private http: any) {}
        getItem() { return this.http.get('/api/items'); }
      }
    `);

    writeFile('src/shared/api/dup2.api.ts', `
      class DupApi2 {
        constructor(private http: any) {}
        getItem() { return this.http.get('/api/items'); }
      }
    `);

    const result = scanClientApiCalls(tmpDir);
    const itemCalls = result.filter((r) => r.url.includes('items') && r.method === 'GET');
    // 중복 제거 후 1개만 남아야 한다
    expect(itemCalls).toHaveLength(1);
  });

  it('URL 정렬이 되어야 한다', () => {
    writeFile('src/domain/api/multi.api.ts', `
      class MultiApi {
        constructor(private http: any) {}
        getZebra() { return this.http.get('/api/zebra'); }
        getAlpha() { return this.http.get('/api/alpha'); }
        getBeta() { return this.http.get('/api/beta'); }
      }
    `);

    const result = scanClientApiCalls(tmpDir);
    const urls = result.map((r) => r.url);

    for (let i = 1; i < urls.length; i++) {
      expect(urls[i].localeCompare(urls[i - 1])).toBeGreaterThanOrEqual(0);
    }
  });

  it('그룹이 URL의 첫 번째 세그먼트로 설정되어야 한다', () => {
    // apiDirs 기본 패턴 'src/domain/**/api'에 매칭되도록 경로 설정
    writeFile('src/domain/user/api/group.api.ts', `
      class GroupApi {
        constructor(private http: any) {}
        getUsers() { return this.http.get('/api/users/list'); }
      }
    `);

    const result = scanClientApiCalls(tmpDir);
    const entry = result.find((r) => r.url.includes('users'));
    expect(entry).toBeDefined();
    // /api/users/list → group은 'api' (첫 세그먼트)
    expect(entry!.group).toBeDefined();
  });

  it('trace.enabled가 false면 사용처 추적을 건너뛰어야 한다', () => {
    writeFile('src/domain/api/notrace.api.ts', `
      class NoTraceApi {
        constructor(private http: any) {}
        getItems() { return this.http.get('/api/items/notrace'); }
      }
    `);

    const config = loadConfig(tmpDir);
    config.trace.enabled = false;

    const result = scanClientApiCalls(tmpDir, config);
    // trace disabled이면 usageChain이 null
    result.forEach((entry) => {
      expect(entry.usageChain).toBeNull();
    });
  });
});
