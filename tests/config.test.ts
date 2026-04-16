import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig, defineConfig } from '../config';

describe('config', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-tracer-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('기본 설정을 반환해야 한다', () => {
    const config = loadConfig(tmpDir);
    expect(config.framework).toBe('auto');
    expect(config.output).toBe('docs/api.html');
    expect(config.apiDirs).toBeDefined();
    expect(config.httpClient.patterns).toContain('this.http');
    expect(config.trace.enabled).toBe(true);
    expect(config.decorators.label).toContain('Attribute');
  });

  it('tsconfig.json의 path alias를 읽어야 한다', () => {
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        paths: {
          '@/*': ['./src/*'],
          '@domain/*': ['./src/domain/*'],
        },
      },
    }));

    const config = loadConfig(tmpDir);
    expect(config.alias['@/']).toBe('./src/');
    expect(config.alias['@domain/']).toBe('./src/domain/');
  });

  it('config 파일을 로드해야 한다', () => {
    fs.writeFileSync(path.join(tmpDir, 'fe-api-tracer.config.js'), `
      module.exports = {
        framework: 'nuxt',
        output: 'custom/api.html',
      };
    `);

    const config = loadConfig(tmpDir);
    expect(config.framework).toBe('nuxt');
    expect(config.output).toBe('custom/api.html');
  });

  it('프리셋을 적용해야 한다', () => {
    fs.writeFileSync(path.join(tmpDir, 'fe-api-tracer.config.js'), `
      module.exports = {
        presets: {
          default: { output: 'docs/default.html' },
          staging: { output: 'docs/staging.html', framework: 'vue' },
        },
      };
    `);

    const defaultConfig = loadConfig(tmpDir);
    expect(defaultConfig.output).toBe('docs/default.html');

    const stagingConfig = loadConfig(tmpDir, 'staging');
    expect(stagingConfig.output).toBe('docs/staging.html');
    expect(stagingConfig.framework).toBe('vue');
  });

  it('defineConfig는 입력을 그대로 반환해야 한다', () => {
    const input = { framework: 'nuxt' as const, output: 'test.html' };
    expect(defineConfig(input)).toEqual(input);
  });
});
