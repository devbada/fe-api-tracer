import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseApiFile, HttpMethod } from '../scripts/lib/ast-parser';

describe('ast-parser', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-parser-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeApiFile(name: string, content: string): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  describe('parseApiFile', () => {
    it('Pages Router: req.method 비교에서 HTTP 메서드를 추출해야 한다', () => {
      const file = writeApiFile('users.ts', `
        import { NextApiRequest, NextApiResponse } from 'next';

        /**
         * 사용자 목록 조회
         * @param {string} name - 사용자 이름
         * @returns {object[]} 사용자 배열
         */
        export default function handler(req: NextApiRequest, res: NextApiResponse) {
          if (req.method === 'GET') {
            res.json([]);
          } else if (req.method === 'POST') {
            res.status(201).json({});
          }
        }
      `);

      const result = parseApiFile(file);

      expect(result.methods).toContain('GET');
      expect(result.methods).toContain('POST');
      expect(result.description).toBe('사용자 목록 조회');
      expect(result.params).toHaveLength(1);
      expect(result.params[0].name).toBe('name');
      expect(result.params[0].type).toBe('string');
      expect(result.returns).not.toBeNull();
      expect(result.returns!.type).toBe('object[]');
    });

    it('Pages Router: switch(req.method)에서 메서드를 추출해야 한다', () => {
      const file = writeApiFile('posts.ts', `
        export default function handler(req, res) {
          switch (req.method) {
            case 'GET':
              return res.json([]);
            case 'PUT':
              return res.json({});
            case 'DELETE':
              return res.status(204).end();
          }
        }
      `);

      const result = parseApiFile(file);

      expect(result.methods).toContain('GET');
      expect(result.methods).toContain('PUT');
      expect(result.methods).toContain('DELETE');
      expect(result.methods).not.toContain('POST');
    });

    it('App Router: export function GET/POST에서 메서드를 추출해야 한다', () => {
      const file = writeApiFile('route.ts', `
        /**
         * 게시글 조회
         */
        export async function GET(request: Request) {
          return Response.json({ ok: true });
        }

        export async function POST(request: Request) {
          return Response.json({ created: true });
        }
      `);

      const result = parseApiFile(file);

      expect(result.methods).toContain('GET');
      expect(result.methods).toContain('POST');
      expect(result.description).toBe('게시글 조회');
    });

    it('메서드 정보가 없으면 ALL을 반환해야 한다', () => {
      const file = writeApiFile('unknown.ts', `
        export default function handler(req, res) {
          res.json({ status: 'ok' });
        }
      `);

      const result = parseApiFile(file);

      expect(result.methods).toEqual(['ALL']);
    });

    it('JSDoc이 없으면 빈 설명과 빈 파라미터를 반환해야 한다', () => {
      const file = writeApiFile('noJsdoc.ts', `
        export default function handler(req, res) {
          if (req.method === 'GET') {
            res.json([]);
          }
        }
      `);

      const result = parseApiFile(file);

      expect(result.description).toBe('');
      expect(result.params).toHaveLength(0);
      expect(result.returns).toBeNull();
    });

    it('optional 파라미터를 감지해야 한다', () => {
      const file = writeApiFile('optional.ts', `
        /**
         * 검색
         * @param {string} [query] - 검색어 (선택)
         * @param {number} page - 페이지 번호
         */
        export default function handler(req, res) {
          if (req.method === 'GET') res.json([]);
        }
      `);

      const result = parseApiFile(file);

      expect(result.params).toHaveLength(2);
      const queryParam = result.params.find((p) => p.name === 'query');
      const pageParam = result.params.find((p) => p.name === 'page');
      expect(queryParam!.required).toBe(false);
      expect(pageParam!.required).toBe(true);
    });

    it('handler 변수로 export default된 경우도 처리해야 한다', () => {
      const file = writeApiFile('varHandler.ts', `
        /**
         * 변수 핸들러
         */
        const handler = (req, res) => {
          if (req.method === 'PATCH') res.json({});
        };
        export default handler;
      `);

      const result = parseApiFile(file);

      expect(result.methods).toContain('PATCH');
    });

    it('파일 상단 JSDoc을 fallback으로 사용해야 한다', () => {
      const file = writeApiFile('topJsdoc.ts', `
        /**
         * 파일 설명 JSDoc
         * @param {string} id - 아이디
         * @returns {object} 결과
         */

        export function GET(req) {
          return Response.json({});
        }
      `);

      const result = parseApiFile(file);

      expect(result.description).toBe('파일 설명 JSDoc');
      expect(result.params).toHaveLength(1);
      expect(result.returns).not.toBeNull();
    });

    it('sourceLine을 올바르게 반환해야 한다', () => {
      const file = writeApiFile('line.ts', `
        // 줄 1: 빈 줄 (실제 파일 시작)
        // 줄 2
        export default function handler(req, res) {
          if (req.method === 'GET') res.json([]);
        }
      `);

      const result = parseApiFile(file);

      expect(result.sourceLine).toBeGreaterThan(0);
    });
  });
});
