import * as fs from 'fs';
import * as path from 'path';
import {
  Project,
  SourceFile,
  SyntaxKind,
  FunctionDeclaration,
  MethodDeclaration,
  ArrowFunction,
  Node,
} from 'ts-morph';

// ─────────────────────────────────────────────
// CLI 인자 파싱
// ─────────────────────────────────────────────
interface ScaffoldArgs {
  root: string;
  dryRun: boolean;
  pattern?: string;
}

function parseArgs(argv: string[]): ScaffoldArgs {
  const args: ScaffoldArgs = { root: process.cwd(), dryRun: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if ((arg === '--root' || arg === '-r') && next) {
      args.root = next;
      i++;
    } else if (arg === '--dry-run' || arg === '-d') {
      args.dryRun = true;
    } else if ((arg === '--pattern' || arg === '-p') && next) {
      args.pattern = next;
      i++;
    }
  }

  return args;
}

// ─────────────────────────────────────────────
// JSDoc 스캐폴드 유틸리티
// ─────────────────────────────────────────────
function hasJsDoc(node: Node): boolean {
  return node.getChildrenOfKind(SyntaxKind.JSDoc).length > 0;
}

function buildJsDocTemplate(
  name: string,
  params: { name: string; type: string }[],
  returnType: string
): string {
  const lines: string[] = ['/**'];
  lines.push(` * TODO: ${name}에 대한 설명을 추가하세요`);

  if (params.length > 0) {
    lines.push(' *');
    params.forEach((p) => {
      lines.push(` * @param {${p.type}} ${p.name} - TODO`);
    });
  }

  if (returnType && returnType !== 'void') {
    lines.push(` * @returns {${returnType}} TODO`);
  }

  lines.push(' */');
  return lines.join('\n');
}

function getReturnTypeText(node: FunctionDeclaration | MethodDeclaration | ArrowFunction): string {
  try {
    const rt = node.getReturnType();
    const text = rt.getText();
    // 너무 긴 타입은 축약
    return text.length > 60 ? 'object' : text;
  } catch {
    return 'any';
  }
}

function getParamsInfo(node: FunctionDeclaration | MethodDeclaration | ArrowFunction): { name: string; type: string }[] {
  try {
    return node.getParameters().map((p) => ({
      name: p.getName(),
      type: (() => {
        try {
          const t = p.getType().getText();
          return t.length > 40 ? 'object' : t;
        } catch {
          return 'any';
        }
      })(),
    }));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// 파일 처리
// ─────────────────────────────────────────────
interface ScaffoldResult {
  file: string;
  functions: string[];
  inserted: number;
}

function processFile(sourceFile: SourceFile, dryRun: boolean): ScaffoldResult | null {
  const functions: string[] = [];
  let insertions = 0;
  let modified = false;

  // 일반 함수
  sourceFile.getFunctions().forEach((fn) => {
    const name = fn.getName();
    if (!name || hasJsDoc(fn)) return;

    const params = getParamsInfo(fn);
    const returnType = getReturnTypeText(fn);
    const jsdoc = buildJsDocTemplate(name, params, returnType);

    functions.push(name);
    if (!dryRun) {
      fn.insertText(fn.getStart(), jsdoc + '\n');
      modified = true;
    }
    insertions++;
  });

  // 클래스 메서드
  sourceFile.getClasses().forEach((cls) => {
    cls.getMethods().forEach((method) => {
      const name = method.getName();
      if (hasJsDoc(method)) return;

      const params = getParamsInfo(method);
      const returnType = getReturnTypeText(method);
      const jsdoc = buildJsDocTemplate(`${cls.getName() ?? 'Class'}.${name}`, params, returnType);

      functions.push(`${cls.getName() ?? 'Class'}.${name}`);
      if (!dryRun) {
        method.insertText(method.getStart(), jsdoc + '\n');
        modified = true;
      }
      insertions++;
    });
  });

  // export const fn = () => {} (VariableStatement with ArrowFunction)
  sourceFile.getVariableStatements().forEach((stmt) => {
    stmt.getDeclarations().forEach((decl) => {
      const initializer = decl.getInitializer();
      if (!initializer) return;
      if (!Node.isArrowFunction(initializer) && !Node.isFunctionExpression(initializer)) return;
      if (hasJsDoc(stmt)) return;

      const name = decl.getName();
      const params = getParamsInfo(initializer as ArrowFunction);
      const returnType = getReturnTypeText(initializer as ArrowFunction);
      const jsdoc = buildJsDocTemplate(name, params, returnType);

      functions.push(name);
      if (!dryRun) {
        (stmt as any).replaceWithText(jsdoc + '\n' + stmt.getText());
        modified = true;
      }
      insertions++;
    });
  });

  if (insertions === 0) return null;

  if (modified) {
    sourceFile.saveSync();
  }

  return {
    file: sourceFile.getFilePath(),
    functions,
    inserted: insertions,
  };
}

// ─────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────
function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root);

  console.log(`[scaffold-jsdoc] 프로젝트: ${root}`);
  console.log(`[scaffold-jsdoc] 모드: ${args.dryRun ? 'dry-run (미리보기)' : '실제 삽입'}`);

  const globPattern = args.pattern ?? 'src/**/*.{ts,tsx}';
  const project = new Project({
    compilerOptions: { allowJs: true, experimentalDecorators: true },
    skipAddingFilesFromTsConfig: true,
  });

  const fullGlob = path.join(root, globPattern);
  project.addSourceFilesAtPaths(fullGlob);

  const files = project.getSourceFiles();
  console.log(`[scaffold-jsdoc] 대상 파일: ${files.length}개\n`);

  const results: ScaffoldResult[] = [];

  for (const sourceFile of files) {
    const result = processFile(sourceFile, args.dryRun);
    if (result) results.push(result);
  }

  if (results.length === 0) {
    console.log('[scaffold-jsdoc] ✅ 모든 함수에 JSDoc이 이미 존재합니다.');
    return;
  }

  console.log(`\n[scaffold-jsdoc] 결과 요약:`);
  let totalInserted = 0;
  results.forEach((r) => {
    const relPath = path.relative(root, r.file);
    console.log(`  ${relPath}: ${r.inserted}개 (${r.functions.join(', ')})`);
    totalInserted += r.inserted;
  });

  console.log(`\n[scaffold-jsdoc] ${args.dryRun ? '삽입 대상' : '삽입 완료'}: ${totalInserted}개 JSDoc (${results.length}개 파일)`);

  if (args.dryRun) {
    console.log('[scaffold-jsdoc] 💡 실제 삽입하려면 --dry-run 플래그를 제거하세요.');
  }
}

main();
