import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────
// API 스냅샷 diff 도구
// CI 파이프라인에서 API 변경 감지용
// ─────────────────────────────────────────────

interface ApiSnapshot {
  meta: { projectName: string; generatedAt: string };
  server: SnapshotEntry[];
  client: SnapshotEntry[];
}

interface SnapshotEntry {
  route?: string;
  url?: string;
  method?: string;
  methods?: string[];
  description?: string;
  params?: { name: string; type: string }[];
  returns?: { type: string; description: string };
  source?: string;
  functionName?: string;
  group?: string;
}

interface DiffResult {
  added: DiffEntry[];
  removed: DiffEntry[];
  changed: DiffChange[];
}

interface DiffEntry {
  type: 'server' | 'client';
  key: string;
  entry: SnapshotEntry;
}

interface DiffChange {
  type: 'server' | 'client';
  key: string;
  field: string;
  before: string;
  after: string;
}

// ─────────────────────────────────────────────
// CLI 인자
// ─────────────────────────────────────────────
interface DiffArgs {
  before: string;
  after: string;
  output?: string;
  exitCode: boolean;
}

function parseArgs(argv: string[]): DiffArgs {
  const args: DiffArgs = { before: '', after: '', exitCode: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if ((arg === '--before' || arg === '-b') && next) {
      args.before = next; i++;
    } else if ((arg === '--after' || arg === '-a') && next) {
      args.after = next; i++;
    } else if ((arg === '--output' || arg === '-o') && next) {
      args.output = next; i++;
    } else if (arg === '--exit-code') {
      args.exitCode = true;
    }
  }

  return args;
}

// ─────────────────────────────────────────────
// 스냅샷 로드
// ─────────────────────────────────────────────
function loadSnapshot(filePath: string): ApiSnapshot {
  if (!fs.existsSync(filePath)) {
    throw new Error(`스냅샷 파일 없음: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ─────────────────────────────────────────────
// 엔트리 키 생성
// ─────────────────────────────────────────────
function entryKey(entry: SnapshotEntry, type: 'server' | 'client'): string {
  if (type === 'server') {
    const methods = (entry.methods ?? []).join(',');
    return `${methods} ${entry.route}`;
  }
  return `${entry.method} ${entry.url}`;
}

// ─────────────────────────────────────────────
// Diff 계산
// ─────────────────────────────────────────────
function computeDiff(before: ApiSnapshot, after: ApiSnapshot): DiffResult {
  const result: DiffResult = { added: [], removed: [], changed: [] };

  // 서버 diff
  diffEntries(before.server, after.server, 'server', result);

  // 클라이언트 diff
  diffEntries(before.client, after.client, 'client', result);

  return result;
}

function diffEntries(
  beforeEntries: SnapshotEntry[],
  afterEntries: SnapshotEntry[],
  type: 'server' | 'client',
  result: DiffResult
): void {
  const beforeMap = new Map<string, SnapshotEntry>();
  const afterMap = new Map<string, SnapshotEntry>();

  beforeEntries.forEach((e) => beforeMap.set(entryKey(e, type), e));
  afterEntries.forEach((e) => afterMap.set(entryKey(e, type), e));

  // 추가된 항목
  afterMap.forEach((entry, key) => {
    if (!beforeMap.has(key)) {
      result.added.push({ type, key, entry });
    }
  });

  // 삭제된 항목
  beforeMap.forEach((entry, key) => {
    if (!afterMap.has(key)) {
      result.removed.push({ type, key, entry });
    }
  });

  // 변경된 항목
  beforeMap.forEach((bEntry, key) => {
    const aEntry = afterMap.get(key);
    if (!aEntry) return;

    // 설명 변경
    if ((bEntry.description ?? '') !== (aEntry.description ?? '')) {
      result.changed.push({
        type, key, field: 'description',
        before: bEntry.description ?? '(없음)',
        after: aEntry.description ?? '(없음)',
      });
    }

    // 파라미터 변경
    const bParams = JSON.stringify(bEntry.params ?? []);
    const aParams = JSON.stringify(aEntry.params ?? []);
    if (bParams !== aParams) {
      result.changed.push({
        type, key, field: 'params',
        before: bParams,
        after: aParams,
      });
    }

    // 반환 타입 변경
    const bReturns = JSON.stringify(bEntry.returns ?? null);
    const aReturns = JSON.stringify(aEntry.returns ?? null);
    if (bReturns !== aReturns) {
      result.changed.push({
        type, key, field: 'returns',
        before: bReturns,
        after: aReturns,
      });
    }
  });
}

// ─────────────────────────────────────────────
// 마크다운 리포트 생성
// ─────────────────────────────────────────────
function generateMarkdownReport(diff: DiffResult, beforePath: string, afterPath: string): string {
  const lines: string[] = [];
  lines.push('# API Diff Report');
  lines.push('');
  lines.push(`- **Before**: \`${path.basename(beforePath)}\``);
  lines.push(`- **After**: \`${path.basename(afterPath)}\``);
  lines.push(`- **Generated**: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
  lines.push('');

  const totalChanges = diff.added.length + diff.removed.length + diff.changed.length;
  if (totalChanges === 0) {
    lines.push('> ✅ API 변경 사항이 없습니다.');
    return lines.join('\n');
  }

  lines.push(`> 총 ${totalChanges}건의 변경이 감지되었습니다.`);
  lines.push('');

  if (diff.added.length > 0) {
    lines.push('## ➕ 추가된 엔드포인트');
    lines.push('');
    diff.added.forEach((d) => {
      lines.push(`- \`${d.key}\` (${d.type})`);
    });
    lines.push('');
  }

  if (diff.removed.length > 0) {
    lines.push('## ➖ 제거된 엔드포인트');
    lines.push('');
    diff.removed.forEach((d) => {
      lines.push(`- \`${d.key}\` (${d.type})`);
    });
    lines.push('');
  }

  if (diff.changed.length > 0) {
    lines.push('## 🔄 변경된 엔드포인트');
    lines.push('');
    diff.changed.forEach((c) => {
      lines.push(`- \`${c.key}\` — **${c.field}** 변경`);
      lines.push(`  - Before: \`${c.before.substring(0, 100)}\``);
      lines.push(`  - After: \`${c.after.substring(0, 100)}\``);
    });
    lines.push('');
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────
// 콘솔 출력
// ─────────────────────────────────────────────
function printDiff(diff: DiffResult): void {
  const total = diff.added.length + diff.removed.length + diff.changed.length;

  if (total === 0) {
    console.log('[diff-api] ✅ API 변경 사항 없음');
    return;
  }

  console.log(`[diff-api] 변경 감지: +${diff.added.length} -${diff.removed.length} ~${diff.changed.length}`);
  console.log('');

  if (diff.added.length > 0) {
    console.log('  ➕ 추가:');
    diff.added.forEach((d) => console.log(`     ${d.key}`));
  }

  if (diff.removed.length > 0) {
    console.log('  ➖ 삭제:');
    diff.removed.forEach((d) => console.log(`     ${d.key}`));
  }

  if (diff.changed.length > 0) {
    console.log('  🔄 변경:');
    diff.changed.forEach((c) => console.log(`     ${c.key} (${c.field})`));
  }
}

// ─────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────
function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (!args.before || !args.after) {
    console.error('Usage: ts-node diff-api.ts --before <snapshot1.api.json> --after <snapshot2.api.json> [--output <report.md>] [--exit-code]');
    process.exit(1);
  }

  const before = loadSnapshot(path.resolve(args.before));
  const after = loadSnapshot(path.resolve(args.after));

  const diff = computeDiff(before, after);
  printDiff(diff);

  if (args.output) {
    const report = generateMarkdownReport(diff, args.before, args.after);
    const outputPath = path.resolve(args.output);
    fs.writeFileSync(outputPath, report, 'utf-8');
    console.log(`\n[diff-api] 리포트 저장: ${outputPath}`);
  }

  // CI용: 변경이 있으면 exit code 1
  if (args.exitCode) {
    const total = diff.added.length + diff.removed.length + diff.changed.length;
    if (total > 0) {
      console.log(`\n[diff-api] 💡 API 변경이 감지되었습니다. (exit code 1)`);
      process.exit(1);
    }
  }
}

main();
