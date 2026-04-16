import { describe, it, expect } from 'vitest';
import { generateHtml, ApiEntry } from '../scripts/lib/html-generator';
import { ClientApiEntry } from '../scripts/lib/client-api-scanner';

describe('html-generator', () => {
  const mockServerEntry: ApiEntry = {
    route: {
      absolutePath: '/project/pages/api/users.ts',
      relativePath: 'pages/api/users.ts',
      routePath: '/api/users',
      group: 'users',
    },
    endpoint: {
      methods: ['GET', 'POST'],
      description: '사용자 관리 API',
      params: [
        { name: 'name', type: 'string', description: '이름', required: true },
        { name: 'age', type: 'number', description: '나이', required: false },
      ],
      returns: { type: 'User[]', description: '사용자 목록' },
      sourceLine: 10,
    },
  };

  const mockClientEntry: ClientApiEntry = {
    method: 'GET',
    url: '/api/posts',
    description: '게시글 조회',
    params: [],
    returns: { type: 'Post[]', description: '게시글 목록' },
    sourceFile: 'src/domain/post/api/post.api.ts',
    sourceAbsPath: '/project/src/domain/post/api/post.api.ts',
    sourceLine: 5,
    functionName: 'getPosts',
    group: 'api',
    usageChain: {
      apiFunction: 'getPosts',
      directCallers: [
        { file: 'src/domain/post/query/post.query.ts', functionName: 'usePostList', isPage: false },
      ],
      pageCallers: [
        { file: 'src/pages/posts/index.tsx', functionName: 'PostListPage', isPage: true },
      ],
    },
  };

  describe('generateHtml', () => {
    it('유효한 HTML을 반환해야 한다', () => {
      const html = generateHtml([mockServerEntry], [mockClientEntry], 'Test Project');

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('</html>');
      expect(html).toContain('<title>Test Project — API Docs</title>');
    });

    it('프로젝트 이름을 표시해야 한다', () => {
      const html = generateHtml([], [], 'My App');
      expect(html).toContain('My App');
    });

    it('서버 라우트 탭과 클라이언트 호출 탭이 있어야 한다', () => {
      const html = generateHtml([mockServerEntry], [mockClientEntry], 'Test');

      expect(html).toContain('서버 라우트');
      expect(html).toContain('클라이언트 호출');
      expect(html).toContain('통계');
    });

    it('서버 엔트리의 HTTP 메서드 뱃지를 렌더링해야 한다', () => {
      const html = generateHtml([mockServerEntry], [], 'Test');

      expect(html).toContain('GET');
      expect(html).toContain('POST');
    });

    it('서버 엔트리의 경로를 표시해야 한다', () => {
      const html = generateHtml([mockServerEntry], [], 'Test');

      expect(html).toContain('/api/users');
    });

    it('파라미터 정보를 렌더링해야 한다', () => {
      const html = generateHtml([mockServerEntry], [], 'Test');

      expect(html).toContain('name');
      expect(html).toContain('string');
      expect(html).toContain('이름');
      expect(html).toContain('required');
      expect(html).toContain('optional');
    });

    it('반환 타입 정보를 렌더링해야 한다', () => {
      const html = generateHtml([mockServerEntry], [], 'Test');

      expect(html).toContain('User[]');
      expect(html).toContain('사용자 목록');
    });

    it('클라이언트 엔트리의 사용처를 렌더링해야 한다', () => {
      const html = generateHtml([], [mockClientEntry], 'Test');

      expect(html).toContain('usePostList');
      expect(html).toContain('PostListPage');
      expect(html).toContain('src/pages/posts/index.tsx');
    });

    it('빈 엔트리일 때도 에러 없이 HTML을 생성해야 한다', () => {
      const html = generateHtml([], [], 'Empty Project');

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Empty Project');
    });

    it('그룹 라벨을 사이드바에 렌더링해야 한다', () => {
      const html = generateHtml([mockServerEntry], [], 'Test');

      expect(html).toContain('users');
    });

    it('검색 입력창이 포함되어야 한다', () => {
      const html = generateHtml([], [], 'Test');

      expect(html).toContain('search-input');
      expect(html).toContain('API 검색');
    });

    it('메서드 필터 버튼이 포함되어야 한다', () => {
      const html = generateHtml([], [], 'Test');

      expect(html).toContain('method-filters');
      expect(html).toContain('method-btn');
    });

    it('통계 대시보드 컨테이너가 포함되어야 한다', () => {
      const html = generateHtml([], [], 'Test');

      expect(html).toContain('stats-panel');
      expect(html).toContain('stats-dashboard');
    });

    it('키보드 단축키 JS가 포함되어야 한다', () => {
      const html = generateHtml([], [], 'Test');

      expect(html).toContain('Escape');
      expect(html).toContain('ArrowDown');
      expect(html).toContain('ArrowUp');
    });

    it('다크 모드 CSS가 포함되어야 한다', () => {
      const html = generateHtml([], [], 'Test');

      expect(html).toContain('prefers-color-scheme:dark');
    });

    it('사이드바 리사이즈 핸들이 포함되어야 한다', () => {
      const html = generateHtml([], [], 'Test');

      expect(html).toContain('resize-handle');
    });

    it('XSS 방지를 위해 HTML 이스케이프가 적용되어야 한다', () => {
      const xssEntry: ApiEntry = {
        route: {
          absolutePath: '/test.ts',
          relativePath: 'test.ts',
          routePath: '/api/<script>alert(1)</script>',
          group: 'test',
        },
        endpoint: {
          methods: ['GET'],
          description: '<img onerror=alert(1)>',
          params: [],
          returns: null,
          sourceLine: 1,
        },
      };

      const html = generateHtml([xssEntry], [], 'Test');

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('사용처가 없는 클라이언트 엔트리를 처리해야 한다', () => {
      const noUsageEntry: ClientApiEntry = {
        method: 'DELETE',
        url: '/api/orphan',
        description: '',
        params: [],
        returns: null,
        sourceFile: 'src/api/orphan.api.ts',
        sourceAbsPath: '/project/src/api/orphan.api.ts',
        sourceLine: 1,
        functionName: 'deleteOrphan',
        group: 'api',
        usageChain: null,
      };

      const html = generateHtml([], [noUsageEntry], 'Test');

      expect(html).toContain('사용처를 찾지 못했습니다');
    });
  });
});
