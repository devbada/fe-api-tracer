import * as fs from 'fs';
import * as path from 'path';
import { Project, SyntaxKind, ClassDeclaration, PropertyDeclaration } from 'ts-morph';
import { ParamInfo } from './ast-parser';
import { DecoratorConfig } from '../../config';

const project = new Project({
  compilerOptions: { allowJs: true, experimentalDecorators: true },
  skipAddingFilesFromTsConfig: true,
});

// 이미 로드된 파일 추적
const loadedFiles = new Set<string>();

function loadFile(filePath: string): void {
  if (loadedFiles.has(filePath)) return;
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  project.createSourceFile(filePath, content, { overwrite: true });
  loadedFiles.add(filePath);
}

// src 하위 모든 .ts 파일 사전 로드 (클래스 탐색용)
export function preloadSourceFiles(projectRoot: string): void {
  const srcDir = path.join(projectRoot, 'src');
  if (!fs.existsSync(srcDir)) return;

  function walk(dir: string): void {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        loadFile(full);
      }
    });
  }

  walk(srcDir);
  console.log(`[api-docs] 소스 파일 로드 완료: ${loadedFiles.size}개`);
}

// ─────────────────────────────────────────────
// 기본 데코레이터 설정 (하위 호환용)
// ─────────────────────────────────────────────
const DEFAULT_DECORATORS: Required<DecoratorConfig> = {
  label: ['Attribute', 'ApiProperty', 'ApiPropertyOptional'],
  required: ['IsNotEmpty', 'IsNotBlank'],
};

// 데코레이터 이름 추출
function getDecoratorNames(prop: PropertyDeclaration): string[] {
  return prop.getDecorators().map((d) => d.getName());
}

// label 데코레이터에서 값 추출 (config 기반)
function getAttributeLabel(prop: PropertyDeclaration, labelDecorators: string[]): string {
  const decorator = prop.getDecorators().find((d) => labelDecorators.includes(d.getName()));
  if (!decorator) return '';
  const args = decorator.getArguments();
  if (args.length === 0) return '';
  return args[0].getText().replace(/['"]/g, '');
}

// 검증 데코레이터로 required 판별 (config 기반)
function isRequired(prop: PropertyDeclaration, requiredDecorators: string[]): boolean {
  const names = getDecoratorNames(prop);
  if (names.some((n) => requiredDecorators.includes(n))) return true;
  // 옵셔널 마크(?) 가 있으면 optional
  if (prop.hasQuestionToken()) return false;
  return true;
}

// 검증 데코레이터로 타입 설명 보강
function inferTypeDescription(prop: PropertyDeclaration): string {
  const names = getDecoratorNames(prop);
  const hints: string[] = [];

  if (names.includes('IsEmail')) hints.push('email 형식');
  if (names.includes('IsUrl')) hints.push('URL 형식');
  if (names.includes('IsPhoneNumber')) hints.push('전화번호 형식');
  if (names.includes('IsPassword')) hints.push('비밀번호 형식');
  if (names.includes('IsPasswordMatch')) {
    const d = prop.getDecorators().find((x) => x.getName() === 'IsPasswordMatch');
    const target = d?.getArguments()[0]?.getText().replace(/['"]/g, '') ?? '';
    hints.push(`${target}와 일치`);
  }
  if (names.includes('Min')) {
    const d = prop.getDecorators().find((x) => x.getName() === 'Min');
    hints.push(`최솟값: ${d?.getArguments()[0]?.getText() ?? ''}`);
  }
  if (names.includes('Max')) {
    const d = prop.getDecorators().find((x) => x.getName() === 'Max');
    hints.push(`최댓값: ${d?.getArguments()[0]?.getText() ?? ''}`);
  }
  if (names.includes('MinLength')) {
    const d = prop.getDecorators().find((x) => x.getName() === 'MinLength');
    hints.push(`최소 ${d?.getArguments()[0]?.getText() ?? ''}자`);
  }
  if (names.includes('MaxLength')) {
    const d = prop.getDecorators().find((x) => x.getName() === 'MaxLength');
    hints.push(`최대 ${d?.getArguments()[0]?.getText() ?? ''}자`);
  }
  if (names.includes('IsEnum')) {
    const d = prop.getDecorators().find((x) => x.getName() === 'IsEnum');
    hints.push(`enum: ${d?.getArguments()[0]?.getText() ?? ''}`);
  }

  return hints.join(', ');
}

// 클래스에서 ParamInfo[] 추출 (config 기반 데코레이터)
function extractParamsFromClass(
  classDecl: ClassDeclaration,
  decoratorConfig: Required<DecoratorConfig>
): ParamInfo[] {
  return classDecl
    .getProperties()
    .map((prop): ParamInfo => {
      const name = prop.getName();
      const tsType = prop.getTypeNode()?.getText() ?? 'any';
      const label = getAttributeLabel(prop, decoratorConfig.label);
      const typeHint = inferTypeDescription(prop);
      const description = [label, typeHint].filter(Boolean).join(' — ');

      return {
        name,
        type: tsType,
        description,
        required: isRequired(prop, decoratorConfig.required),
      };
    });
}

// 클래스 이름으로 프로젝트 전체에서 탐색
// 예: 'AccountRequestModel.RecoverPassword' → RecoverPassword 클래스
function findClassByName(className: string): ClassDeclaration | null {
  // 네임스페이스 제거 (AccountRequestModel.RecoverPassword → RecoverPassword)
  const simpleName = className.split('.').pop() ?? className;

  for (const sourceFile of project.getSourceFiles()) {
    // 직접 export된 클래스
    const direct = sourceFile.getClass(simpleName);
    if (direct) return direct;

    // 네임스페이스/모듈 내부 클래스
    for (const ns of sourceFile.getModules()) {
      const inside = ns.getClass(simpleName);
      if (inside) return inside;
    }
  }
  return null;
}

// 타입 문자열로 모델 파라미터 추출
// typeText 예: 'AccountRequestModel.RecoverPassword', 'CreatePostDto'
export function resolveModelParams(
  typeText: string,
  decoratorConfig?: DecoratorConfig
): ParamInfo[] {
  if (!typeText || typeText === 'any' || typeText === 'unknown') return [];

  const classDecl = findClassByName(typeText);
  if (!classDecl) return [];

  const config: Required<DecoratorConfig> = {
    label: decoratorConfig?.label ?? DEFAULT_DECORATORS.label,
    required: decoratorConfig?.required ?? DEFAULT_DECORATORS.required,
  };

  return extractParamsFromClass(classDecl, config);
}
