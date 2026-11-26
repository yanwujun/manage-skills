import {
  diffText,
  historyName,
  latestEvalVerdicts,
  loadEvalResults,
  loadHistory,
  normalizePath,
  purgeSkillHistory,
  readBlob,
  type EvalVerdictEntry,
  type HistoryEntry,
} from '@manage-skills/core';
import { createNodeFs } from '../io/node-fs.js';
import { createPlatformEnv } from '../io/env.js';
import { blobsDir, evalResultsDir, historyPath } from '../io/paths.js';
import { confirm } from '../io/confirm.js';

export interface HistoryOptions {
  action?: string;
  target?: string;
  name?: string;
  json?: boolean;
  yes?: boolean;
}

interface DisplayRow {
  entry: HistoryEntry;
  previous?: HistoryEntry;
  diff: string;
}

function formatTime(entry: HistoryEntry): string {
  return entry.recordedAt.replace('T', ' ').slice(0, 19);
}

function formatSize(size: number): string {
  if (size < 1024) return `${size}B`;
  return `${(size / 1024).toFixed(1)}KB`;
}

function matchesTarget(entry: HistoryEntry, target: string): boolean {
  return historyName(entry) === target || normalizePath(entry.path) === normalizePath(target);
}

/** 为每条历史找到同路径的前一条（只用于差异统计，不跨路径比较）。 */
function previousByEntry(entries: HistoryEntry[]): Map<HistoryEntry, HistoryEntry> {
  const chrono = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const list = chrono.get(entry.path);
    if (list) {
      list.push(entry);
    } else {
      chrono.set(entry.path, [entry]);
    }
  }

  const previous = new Map<HistoryEntry, HistoryEntry>();
  for (const list of chrono.values()) {
    for (let index = 1; index < list.length; index += 1) {
      previous.set(list[index]!, list[index - 1]!);
    }
  }
  return previous;
}

async function diffSummary(
  fs: ReturnType<typeof createNodeFs>,
  blobs: string,
  entry: HistoryEntry,
  previous: HistoryEntry | undefined,
): Promise<string> {
  if (!previous) return '—';
  const [before, after] = await Promise.all([
    readBlob(fs, blobs, previous.hash),
    readBlob(fs, blobs, entry.hash),
  ]);
  if (before === null || after === null) return '—';
  const { added, removed, changed } = diffText(before, after).stats;
  return `+${added} -${removed} ~${changed}`;
}

async function buildRows(
  fs: ReturnType<typeof createNodeFs>,
  blobs: string,
  entries: HistoryEntry[],
): Promise<DisplayRow[]> {
  const previous = previousByEntry(entries);
  const rows: DisplayRow[] = [];
  for (const entry of entries) {
    const prev = previous.get(entry);
    rows.push({ entry, ...(prev ? { previous: prev } : {}), diff: await diffSummary(fs, blobs, entry, prev) });
  }
  return rows.sort(
    (a, b) =>
      b.entry.recordedAt.localeCompare(a.entry.recordedAt) ||
      a.entry.path.localeCompare(b.entry.path),
  );
}

function renderRows(
  rows: DisplayRow[],
  verdicts?: Map<string, EvalVerdictEntry>,
): string[] {
  const lines: string[] = [];
  for (const row of rows) {
    const { entry } = row;
    lines.push(
      `${formatTime(entry)}  ${(entry.version ?? '—').padEnd(7)} ${entry.hash.slice(0, 12)}  ` +
        `${formatSize(entry.size).padStart(7)}  ${row.diff.padEnd(14)} ${historyName(entry)}`,
    );
    lines.push(`  路径：${entry.path}`);
    if (entry.cause === 'bump' || entry.note) {
      lines.push(`  来源：${entry.cause}${entry.note ? `（${entry.note}）` : ''}`);
    }
    const verdict = verdicts?.get(entry.hash);
    if (verdict) {
      lines.push(
        `  评测：${verdict.verdictLabel} ${verdict.deltaPp >= 0 ? '+' : ''}${verdict.deltaPp}pp` +
          `（${verdict.from.hash.slice(0, 8)} → ${verdict.to.hash.slice(0, 8)}，${verdict.runId}）`,
      );
    }
  }
  return lines;
}

function toJson(rows: DisplayRow[]): unknown[] {
  return rows.map((row) => ({
    path: row.entry.path,
    name: historyName(row.entry),
    version: row.entry.version ?? null,
    hash: row.entry.hash,
    size: row.entry.size,
    mtimeMs: row.entry.mtimeMs,
    cause: row.entry.cause,
    note: row.entry.note ?? null,
    recordedAt: row.entry.recordedAt,
    diff: row.diff === '—' ? null : row.diff,
  }));
}

async function runShow(
  fs: ReturnType<typeof createNodeFs>,
  blobs: string,
  entries: HistoryEntry[],
  target: string,
  json: boolean,
  verdicts: Map<string, EvalVerdictEntry>,
): Promise<number> {
  const matched = entries.filter((entry) => matchesTarget(entry, target));
  if (matched.length === 0) {
    console.error(`没有该技能的历史：${target}`);
    return 1;
  }
  const rows = await buildRows(fs, blobs, matched);
  if (json) {
    console.log(JSON.stringify(toJson(rows), null, 2));
    return 0;
  }
  console.log(`技能：${target}（${matched.length} 条）`);
  for (const line of renderRows(rows, verdicts)) console.log(line);
  return 0;
}

async function runPurge(fs: ReturnType<typeof createNodeFs>, entries: HistoryEntry[], target: string, yes: boolean): Promise<number> {
  const env = createPlatformEnv();
  const matched = entries.filter((entry) => matchesTarget(entry, target));
  if (matched.length === 0) {
    console.log(`没有该技能的历史：${target}`);
    return 0;
  }

  console.log(`将删除 ${matched.length} 条历史并回收无引用快照（技能：${target}）`);
  if (!yes) {
    if (!process.stdin.isTTY) {
      console.error('非交互环境请加 --yes 确认清理');
      return 1;
    }
    const ok = await confirm('确认清理？(y/N) ');
    if (!ok) {
      console.log('已取消');
      return 0;
    }
  }

  const result = await purgeSkillHistory(
    fs,
    {
      historyPath: historyPath(env.homedir),
      blobsDir: blobsDir(env.homedir),
      evalResultsDir: evalResultsDir(env.homedir),
    },
    target,
  );
  console.log(
    `已删除 ${result.removedEntries} 条历史，回收 ${result.removedBlobs.length} 个快照，` +
      `保留 ${result.keptBlobs} 个被引用的快照`,
  );
  return 0;
}

export async function runHistory(options: HistoryOptions): Promise<number> {
  const action = options.action;
  if (action && action !== 'show' && action !== 'purge') {
    console.error('用法：manage-skills history [--name <技能>] | history show <技能> | history purge <技能>');
    return 1;
  }
  if ((action === 'show' || action === 'purge') && !options.target) {
    console.error(`用法：manage-skills history ${action} <技能名|路径>`);
    return 1;
  }

  const env = createPlatformEnv();
  const fs = createNodeFs();
  const loaded = await loadHistory(fs, historyPath(env.homedir));
  if (loaded.error) {
    console.error(loaded.error);
    return 1;
  }
  if (loaded.skipped > 0) console.error(`[warn] 跳过 ${loaded.skipped} 条损坏的历史记录`);

  const verdicts = latestEvalVerdicts(await loadEvalResults(fs, evalResultsDir(env.homedir)));

  if (action === 'show') {
    return runShow(
      fs,
      blobsDir(env.homedir),
      loaded.entries,
      options.target!,
      options.json ?? false,
      verdicts,
    );
  }
  if (action === 'purge') return runPurge(fs, loaded.entries, options.target!, options.yes ?? false);

  const entries = options.name
    ? loaded.entries.filter((entry) => historyName(entry) === options.name)
    : loaded.entries;
  if (entries.length === 0) {
    console.log('暂无版本历史，先执行 manage-skills scan');
    return 0;
  }

  const rows = await buildRows(fs, blobsDir(env.homedir), entries);
  if (options.json) {
    console.log(JSON.stringify(toJson(rows), null, 2));
    return 0;
  }
  for (const line of renderRows(rows, verdicts)) console.log(line);
  return 0;
}