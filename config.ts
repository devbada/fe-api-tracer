import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

export type Framework = 'nextjs-pages' | 'nextjs-app' | 'nuxt' | 'vue' | 'react' | 'auto';

export interface VuexConfig {
  /** Vuex dispatch 기반 사용처 추적 활성화 (기본: true, store/ 디렉토리 존재 시 자동 감지) */
  enabled?: boolean;
  /** store 디렉토리 경로 (기본: 'store') */
  storeDir?: string;
  /** dispatch 패턴 정규식 (기본: $store.dispatch / dispatch 자동 감지) */
  dispatchPattern?: string;
}

export interface TraceConfig {
  enabled?: boolean;
  exclude?: string[];
  sharedDirs?: string[];
  queryPattern?: RegExp;
  pagePattern?: RegExp;
  /** Vuex store dispatch 기반 추적 설정 */
  vuex?: VuexConfig;
}

export interface HttpClientConfig {
  patterns?: string[];
  methods?: string[];
}

export interface DecoratorConfig {
  label?: string[];
  required?: string[];
}

export interface ApiTracerConfig {
  framework?: Framework;
  root?: string;
  output?: string;
  apiDirs?: string[];
  /** API 호출 파일의 정규식 패턴 (기본: \.api\.(ts|tsx)$) */
  apiFilePattern?: string;
  /** 스캔 대상 디렉토리 (기본: ['src']). store/, lib/ 등 추가 가능 */
  scanDirs?: string[];
  alias?: Record<string, string>;
  httpClient?: HttpClientConfig;
  trace?: TraceConfig;
  decorators?: DecoratorConfig;
  /** URL에서 제거할 접두사 패턴 (예: '${process.env.VUE_APP_API_URL}') */
  urlStripPrefix?: string[];
}

export interface ApiTracerConfigWithPresets {
  presets?: Record<string, ApiTracerConfig>;
}

// ─────────────────────────────────────────────
// 기본값
// ─────────────────────────────────────────────
const DEFAULTS: Required<ApiTracerConfig> = {
  framework: 'auto',
  root: process.cwd(),
  output: 'docs/api.html',
  apiDirs: ['src/domain/**/api', 'src/shared/api', 'shared/api'],
  apiFilePattern: '\\.api\\.(ts|tsx)$',
  scanDirs: ['src'],
  alias: {},
  httpClient: {
    patterns: ['this.http', 'this.axios', 'this.$axios', 'apiClient', 'request'],
    methods: ['get', 'post', 'put', 'patch', 'delete'],
  },
  urlStripPrefix: [],
  trace: {
    enabled: true,
    exclude: ['Container', 'Mapper', 'Injectable', 'singleton'],
    sharedDirs: ['src/shared', 'shared'],
    queryPattern: /\.query\.(ts|tsx)$/,
    pagePattern: /src\/pages\/|(?:^|\/)pages\/(?!api\/)/,
    vuex: {
      enabled: true,
      storeDir: 'store',
    },
  },
  decorators: {
    label: ['Attribute', 'ApiProperty', 'ApiPropertyOptional'],
    required: ['IsNotEmpty', 'IsNotBlank'],
  },
};

// ─────────────────────────────────────────────
// .env 파일 파싱
// ─────────────────────────────────────────────
function loadEnvConfig(projectRoot: string): Partial<ApiTracerConfig> {
  const envFiles = [
    path.join(projectRoot, '.env.api-tracer'),
    path.join(projectRoot, '.env.local'),
    path.join(projectRoot, '.env'),
  ];

  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      dotenv.config({ path: envFile });
      break;
    }
  }

  const config: Partial<ApiTracerConfig> = {};

  if (process.env.FE_API_TRACER_OUTPUT) {
    config.output = process.env.FE_API_TRACER_OUTPUT;
  }
  if (process.env.FE_API_TRACER_FRAMEWORK) {
    config.framework = process.env.FE_API_TRACER_FRAMEWORK as Framework;
  }
  if (process.env.FE_API_TRACER_API_DIRS) {
    config.apiDirs = process.env.FE_API_TRACER_API_DIRS.split(',').map((s) => s.trim());
  }
  if (process.env.FE_API_TRACER_HTTP_PATTERNS) {
    config.httpClient = {
      ...config.httpClient,
      patterns: process.env.FE_API_TRACER_HTTP_PATTERNS.split(',').map((s) => s.trim()),
    };
  }
  if (process.env.FE_API_TRACER_ALIAS) {
    try {
      config.alias = JSON.parse(process.env.FE_API_TRACER_ALIAS);
    } catch {
      console.warn('[api-tracer] FE_API_TRACER_ALIAS JSON 파싱 실패, 무시합니다.');
    }
  }
  if (process.env.FE_API_TRACER_TRACE_EXCLUDE) {
    config.trace = {
      ...config.trace,
      exclude: process.env.FE_API_TRACER_TRACE_EXCLUDE.split(',').map((s) => s.trim()),
    };
  }
  if (process.env.FE_API_TRACER_SHARED_DIRS) {
    config.trace = {
      ...config.trace,
      sharedDirs: process.env.FE_API_TRACER_SHARED_DIRS.split(',').map((s) => s.trim()),
    };
  }

  return config;
}

// ─────────────────────────────────────────────
// fe-api-tracer.config.ts 로드
// ─────────────────────────────────────────────
function loadTsConfig(filePath: string): any {
  const content = fs.readFileSync(filePath, 'utf-8');
  // import → require 변환, export default → module.exports 변환
  const transformed = content
    .replace(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]\s*;?/g, 'const {$1} = require("$2");')
    .replace(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?/g, 'const $1 = require("$2");')
    .replace(/export\s+default\s+/, 'module.exports = ');

  // 임시 .js 파일로 저장 후 require
  const tmpPath = filePath.replace(/\.ts$/, '.tmp.js');
  fs.writeFileSync(tmpPath, transformed, 'utf-8');
  try {
    // require 캐시 제거 (재실행 시 최신 반영)
    delete require.cache[require.resolve(tmpPath)];
    return require(tmpPath);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

function loadFileConfig(projectRoot: string, preset?: string): Partial<ApiTracerConfig> {
  const candidates = [
    path.join(projectRoot, 'fe-api-tracer.config.ts'),
    path.join(projectRoot, 'fe-api-tracer.config.js'),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;

    try {
      // .ts 파일은 import 문 변환 후 로드, .js는 직접 require
      const mod = candidate.endsWith('.ts') ? loadTsConfig(candidate) : require(candidate);
      const raw = mod.default ?? mod;

      // 프리셋 지원
      if (raw.presets && preset) {
        const presetConfig = raw.presets[preset] ?? raw.presets['default'] ?? {};
        console.log(`[api-tracer] 프리셋 적용: ${preset}`);
        return presetConfig;
      }

      if (raw.presets) {
        return raw.presets['default'] ?? {};
      }

      return raw as Partial<ApiTracerConfig>;
    } catch (err) {
      console.warn(`[api-tracer] 설정 파일 로드 실패: ${candidate}`, (err as Error).message);
    }
  }

  return {};
}

// ─────────────────────────────────────────────
// tsconfig.json에서 path alias 자동 읽기
// ─────────────────────────────────────────────
function loadTsconfigAlias(projectRoot: string): Record<string, string> {
  const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return {};

  try {
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    const paths: Record<string, string[]> = tsconfig.compilerOptions?.paths ?? {};
    const alias: Record<string, string> = {};

    Object.entries(paths).forEach(([key, values]) => {
      if (values.length === 0) return;
      // "@/*": ["./src/*"] → "@/": "./src/"
      const aliasKey = key.replace(/\/\*$/, '/');
      const aliasValue = values[0].replace(/\/\*$/, '/');
      alias[aliasKey] = aliasValue;
    });

    return alias;
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────
// 설정 병합 (우선순위: CLI > .env > config 파일 > tsconfig alias > 기본값)
// ─────────────────────────────────────────────
export function loadConfig(projectRoot: string, preset?: string): Required<ApiTracerConfig> {
  const tsconfigAlias = loadTsconfigAlias(projectRoot);
  const fileConfig = loadFileConfig(projectRoot, preset);
  const envConfig = loadEnvConfig(projectRoot);

  return {
    framework:      envConfig.framework      ?? fileConfig.framework      ?? DEFAULTS.framework,
    root:           envConfig.root           ?? fileConfig.root           ?? projectRoot,
    output:         envConfig.output         ?? fileConfig.output         ?? DEFAULTS.output,
    apiDirs:        envConfig.apiDirs        ?? fileConfig.apiDirs        ?? DEFAULTS.apiDirs,
    apiFilePattern: fileConfig.apiFilePattern ?? DEFAULTS.apiFilePattern,
    scanDirs:       fileConfig.scanDirs      ?? DEFAULTS.scanDirs,
    urlStripPrefix: fileConfig.urlStripPrefix ?? DEFAULTS.urlStripPrefix,
    alias: {
      ...tsconfigAlias,
      ...DEFAULTS.alias,
      ...fileConfig.alias,
      ...envConfig.alias,
    },
    httpClient: {
      ...DEFAULTS.httpClient,
      ...fileConfig.httpClient,
      ...envConfig.httpClient,
    },
    trace: {
      ...DEFAULTS.trace,
      ...fileConfig.trace,
      ...envConfig.trace,
      vuex: {
        ...DEFAULTS.trace.vuex,
        ...fileConfig.trace?.vuex,
        ...envConfig.trace?.vuex,
      },
    },
    decorators: {
      ...DEFAULTS.decorators,
      ...fileConfig.decorators,
    },
  };
}

// ─────────────────────────────────────────────
// defineConfig helper (타입 힌트용)
// ─────────────────────────────────────────────
export function defineConfig(config: ApiTracerConfig | ApiTracerConfigWithPresets) {
  return config;
}
