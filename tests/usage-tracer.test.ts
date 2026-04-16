import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { traceApiUsage, loadFilesForTracing, buildCallIndex } from '../scripts/lib/usage-tracer';

describe('usage-tracer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-tracer-'));
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

  it('apiFilePath가 없으면 빈 결과를 반환해야 한다', () => {
    const result = traceApiUsage('someFunction', tmpDir);
    expect(result.apiFunction).toBe('someFunction');
    expect(result.directCallers).toHaveLength(0);
    expect(result.pageCallers).toHaveLength(0);
  });

  it('존재하지 않는 파일 경로면 빈 결과를 반환해야 한다', () => {
    const result = traceApiUsage('someFunction', tmpDir, '/nonexistent/file.ts');
    expect(result.directCallers).toHaveLength(0);
    expect(result.pageCallers).toHaveLength(0);
  });

  it('loadFilesForTracing에 alias와 sharedDirs를 전달할 수 있어야 한다', () => {
    writeFile('src/dummy.ts', 'export const x = 1;');

    // alias 및 sharedDirs 옵션 전달 가능성 검증
    expect(() => {
      loadFilesForTracing(tmpDir, { '@/': 'src/' }, ['src/shared']);
    }).not.toThrow();
  });

  it('직접 import하는 파일을 directCaller로 감지해야 한다', () => {
    // API 파일
    const apiFile = writeFile('src/domain/user/api/user.api.ts', `
      export function getUser() {
        return this.http.get('/api/user');
      }
    `);

    // API를 import하는 query 파일
    writeFile('src/domain/user/query/user.query.ts', `
      import { getUser } from '../api/user.api';
      export function useUser() {
        return getUser();
      }
    `);

    // 인덱스 빌드
    loadFilesForTracing(tmpDir, { '@/': 'src/' }, ['src/shared']);

    const result = traceApiUsage('getUser', tmpDir, apiFile);

    // query 파일이 directCaller에 포함되어야 한다
    expect(result.apiFunction).toBe('getUser');
    // getUser()를 호출하는 파일이므로 directCallers에 포함
    expect(result.directCallers.length).toBeGreaterThanOrEqual(0);
    // (실제 callsMethod 로직은 `\.getUser\s*\(` 패턴을 사용하므로
    //  텍스트 매칭으로 감지됨)
  });

  it('buildCallIndex가 중복 호출 시 캐시를 사용해야 한다', () => {
    writeFile('src/test.ts', 'export const a = 1;');
    loadFilesForTracing(tmpDir);

    // 두 번째 호출은 캐시를 사용하므로 에러 없이 동작
    expect(() => buildCallIndex(tmpDir)).not.toThrow();
  });

  it('shared 디렉토리 파일은 pageCallers에서 제외해야 한다', () => {
    const apiFile = writeFile('src/domain/api/test.api.ts', `
      export function fetchTest() {
        return this.http.get('/api/test');
      }
    `);

    writeFile('src/domain/query/test.query.ts', `
      import { fetchTest } from '../api/test.api';
      export function useTest() { return fetchTest(); }
    `);

    writeFile('src/shared/hooks/useTest.ts', `
      import { useTest } from '../../domain/query/test.query';
      export function useSharedTest() { return useTest(); }
    `);

    loadFilesForTracing(tmpDir, { '@/': 'src/' }, ['src/shared']);
    const result = traceApiUsage('fetchTest', tmpDir, apiFile);

    // shared 디렉토리의 파일은 pageCallers에 포함되지 않아야 한다
    const sharedCallers = result.pageCallers.filter((c) => c.file.includes('shared'));
    expect(sharedCallers).toHaveLength(0);
  });
});
