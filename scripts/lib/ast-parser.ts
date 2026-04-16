import {
  Project,
  SourceFile,
  SyntaxKind,
  JSDoc,
  Node,
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression,
} from 'ts-morph';
import * as fs from 'fs';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'ALL';

export interface ParamInfo {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface ReturnsInfo {
  type: string;
  description: string;
}

export interface ParsedEndpoint {
  methods: HttpMethod[];
  description: string;
  params: ParamInfo[];
  returns: ReturnsInfo | null;
  sourceLine: number;
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

const project = new Project({
  compilerOptions: { allowJs: true },
  skipAddingFilesFromTsConfig: true,
});

function extractJsDocFromNode(node: Node): JSDoc | null {
  const jsDocs = node.getChildrenOfKind(SyntaxKind.JSDoc);
  return jsDocs.length > 0 ? jsDocs[0] : null;
}

function parseJsDoc(jsDoc: JSDoc): {
  description: string;
  params: ParamInfo[];
  returns: ReturnsInfo | null;
} {
  const description = jsDoc.getDescription()?.trim() ?? '';
  const params: ParamInfo[] = [];
  let returns: ReturnsInfo | null = null;

  jsDoc.getTags().forEach((tag) => {
    const tagName = tag.getTagName();

    if (tagName === 'param') {
      const text = tag.getText();
      const typeMatch = text.match(/\{(.+?)\}/);
      const nameMatch = text.match(/\}\s+(\[?[\w.]+\]?)/);
      const descMatch = text.match(/\}\s+\[?[\w.]+\]?\s*[-—]?\s*(.+)/);

      const rawName = nameMatch?.[1] ?? '';
      const required = !rawName.startsWith('[');
      const name = rawName.replace(/^\[/, '').replace(/\]$/, '');

      params.push({
        name,
        type: typeMatch?.[1] ?? 'any',
        description: descMatch?.[1]?.trim() ?? '',
        required,
      });
      return;
    }

    if (tagName === 'returns' || tagName === 'return') {
      const text = tag.getText();
      const typeMatch = text.match(/\{(.+?)\}/);
      const descMatch = text.match(/\}\s*(.+)/);
      returns = {
        type: typeMatch?.[1] ?? 'void',
        description: descMatch?.[1]?.trim() ?? '',
      };
    }
  });

  return { description, params, returns };
}

function extractMethodsFromSourceFile(sourceFile: SourceFile): HttpMethod[] {
  const methods = new Set<HttpMethod>();

  // Pages Router 패턴: req.method === 'GET' or req.method !== 'POST'
  const methodComparisons = sourceFile.getDescendantsOfKind(
    SyntaxKind.BinaryExpression
  );

  methodComparisons.forEach((expr) => {
    const left = expr.getLeft().getText();
    const right = expr.getRight().getText();

    if (left.includes('req.method') || left.includes('request.method')) {
      const matched = right.replace(/['"]/g, '').toUpperCase();
      if (HTTP_METHODS.includes(matched as HttpMethod)) {
        methods.add(matched as HttpMethod);
      }
    }
  });

  // switch(req.method) case 'GET':
  const switchStatements = sourceFile.getDescendantsOfKind(
    SyntaxKind.SwitchStatement
  );

  switchStatements.forEach((sw) => {
    const expr = sw.getExpression().getText();
    if (!expr.includes('method')) return;

    sw.getCaseBlock()
      .getClauses()
      .forEach((clause) => {
        if (clause.getKind() !== SyntaxKind.CaseClause) return;
        const caseClause = clause.asKindOrThrow(SyntaxKind.CaseClause);
        const text = caseClause.getExpression().getText().replace(/['"]/g, '').toUpperCase();
        if (HTTP_METHODS.includes(text as HttpMethod)) {
          methods.add(text as HttpMethod);
        }
      });
  });

  // App Router 패턴: export async function GET(...) 또는 export function POST(...)
  sourceFile.getFunctions().forEach((fn) => {
    if (!fn.isExported()) return;
    const name = fn.getName()?.toUpperCase() ?? '';
    if (HTTP_METHODS.includes(name as HttpMethod)) {
      methods.add(name as HttpMethod);
    }
  });

  if (methods.size === 0) {
    methods.add('ALL');
  }

  return Array.from(methods);
}

function findHandlerFunction(
  sourceFile: SourceFile
): FunctionDeclaration | ArrowFunction | FunctionExpression | null {
  // export default function handler(...)
  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    const declarations = defaultExport.getDeclarations();
    for (const decl of declarations) {
      if (
        decl.getKind() === SyntaxKind.FunctionDeclaration ||
        decl.getKind() === SyntaxKind.ArrowFunction ||
        decl.getKind() === SyntaxKind.FunctionExpression
      ) {
        return decl as FunctionDeclaration | ArrowFunction | FunctionExpression;
      }

      // export default handler -> variable 선언 추적
      if (decl.getKind() === SyntaxKind.ExportAssignment) {
        const expr = (decl as any).getExpression?.();
        if (!expr) continue;
        const text = expr.getText();
        const varDecl = sourceFile
          .getVariableDeclarations()
          .find((v) => v.getName() === text);
        if (varDecl) {
          const init = varDecl.getInitializer();
          if (
            init &&
            (init.getKind() === SyntaxKind.ArrowFunction ||
              init.getKind() === SyntaxKind.FunctionExpression)
          ) {
            return init as ArrowFunction | FunctionExpression;
          }
        }
      }
    }
  }

  // fallback: 파일 최상위 함수 중 handler 이름
  const handlerFn = sourceFile
    .getFunctions()
    .find((fn) => fn.getName() === 'handler');
  if (handlerFn) return handlerFn;

  return null;
}

export function parseApiFile(filePath: string): ParsedEndpoint {
  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = project.createSourceFile(filePath, content, {
    overwrite: true,
  });

  const methods = extractMethodsFromSourceFile(sourceFile);
  const handlerFn = findHandlerFunction(sourceFile);

  let description = '';
  let params: ParamInfo[] = [];
  let returns: ReturnsInfo | null = null;
  let sourceLine = 1;

  if (handlerFn) {
    sourceLine = handlerFn.getStartLineNumber();
    const jsDoc = extractJsDocFromNode(handlerFn);
    if (jsDoc) {
      const parsed = parseJsDoc(jsDoc);
      description = parsed.description;
      params = parsed.params;
      returns = parsed.returns;
    }
  }

  // fallback: 파일 상단 첫 번째 JSDoc
  if (!description) {
    const allJsDocs = sourceFile.getDescendantsOfKind(SyntaxKind.JSDoc);
    if (allJsDocs.length > 0) {
      const parsed = parseJsDoc(allJsDocs[0]);
      description = parsed.description;
      if (params.length === 0) params = parsed.params;
      if (!returns) returns = parsed.returns;
    }
  }

  return { methods, description, params, returns, sourceLine };
}
