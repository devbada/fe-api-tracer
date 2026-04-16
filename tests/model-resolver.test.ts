import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Project } from 'ts-morph';
import { resolveModelParams } from '../scripts/lib/model-resolver';

describe('model-resolver', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-resolver-'));

    // 테스트용 모델 클래스 파일 생성
    const modelDir = path.join(tmpDir, 'src', 'models');
    fs.mkdirSync(modelDir, { recursive: true });

    // 데코레이터가 있는 모델 클래스
    fs.writeFileSync(path.join(modelDir, 'user.model.ts'), `
      function Attribute(label: string) { return (target: any, key: string) => {}; }
      function IsNotEmpty() { return (target: any, key: string) => {}; }
      function IsEmail() { return (target: any, key: string) => {}; }
      function MinLength(n: number) { return (target: any, key: string) => {}; }
      function MaxLength(n: number) { return (target: any, key: string) => {}; }

      export class CreateUserDto {
        @Attribute('이메일')
        @IsNotEmpty()
        @IsEmail()
        email: string;

        @Attribute('이름')
        @IsNotEmpty()
        @MinLength(2)
        @MaxLength(20)
        name: string;

        @Attribute('나이')
        age?: number;
      }
    `, 'utf-8');
  });

  it('알 수 없는 타입에 빈 배열을 반환해야 한다', () => {
    expect(resolveModelParams('any')).toEqual([]);
    expect(resolveModelParams('unknown')).toEqual([]);
    expect(resolveModelParams('')).toEqual([]);
  });

  it('프로젝트에 없는 클래스에 빈 배열을 반환해야 한다', () => {
    expect(resolveModelParams('NonExistentClass')).toEqual([]);
  });

  it('커스텀 decorator config를 받을 수 있어야 한다', () => {
    // 존재하지 않는 클래스이므로 빈 배열이지만, 함수 시그니처 호환성 확인
    const result = resolveModelParams('SomeClass', {
      label: ['CustomLabel'],
      required: ['CustomRequired'],
    });
    expect(result).toEqual([]);
  });

  it('decorator config 없이도 기본값으로 동작해야 한다', () => {
    // 시그니처 호환성: 두 번째 인자 없이 호출
    const result = resolveModelParams('NonExistent');
    expect(result).toEqual([]);
  });
});
