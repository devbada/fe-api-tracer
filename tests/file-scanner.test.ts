import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { convertFilePathToRoute, extractGroup } from '../scripts/lib/file-scanner';

describe('file-scanner', () => {
  describe('convertFilePathToRoute', () => {
    const apiRoot = '/project/pages/api';

    it('일반 파일 경로를 라우트로 변환해야 한다', () => {
      const result = convertFilePathToRoute(
        path.join(apiRoot, 'users.ts'),
        apiRoot
      );
      expect(result).toBe('/api/users');
    });

    it('index 파일을 부모 라우트로 변환해야 한다', () => {
      const result = convertFilePathToRoute(
        path.join(apiRoot, 'users', 'index.ts'),
        apiRoot
      );
      expect(result).toBe('/api/users');
    });

    it('동적 라우트 [id]를 :id로 변환해야 한다', () => {
      const result = convertFilePathToRoute(
        path.join(apiRoot, 'users', '[id].ts'),
        apiRoot
      );
      expect(result).toBe('/api/users/:id');
    });

    it('catch-all [...slug]를 *slug로 변환해야 한다', () => {
      const result = convertFilePathToRoute(
        path.join(apiRoot, 'docs', '[...slug].ts'),
        apiRoot
      );
      expect(result).toBe('/api/docs/*slug');
    });

    it('중첩 디렉토리를 올바르게 처리해야 한다', () => {
      const result = convertFilePathToRoute(
        path.join(apiRoot, 'admin', 'settings', 'roles.ts'),
        apiRoot
      );
      expect(result).toBe('/api/admin/settings/roles');
    });
  });

  describe('extractGroup', () => {
    it('라우트 경로에서 그룹을 추출해야 한다', () => {
      expect(extractGroup('/api/users')).toBe('users');
      expect(extractGroup('/api/admin/settings')).toBe('admin');
    });

    it('루트 경로에서 root를 반환해야 한다', () => {
      expect(extractGroup('/api/')).toBe('root');
    });
  });
});
