import { dirName } from '../utils/path.js';
import type { FileSystem, FileSystemReader } from '../utils/fs.js';
import type { HistoryEntry } from '../types/index.js';

export const HISTORY_FILE_NAME = 'history.jsonl';

export interface LoadHistoryResult {
  entries: HistoryEntry[];
  /** 读取失败时的错误信息；entries 仍为已解析出的部分 */
  error?: string;
  /** 跳过的损坏行数 */
  skipped: number;
}

const CAUSES = new Set(['scan', 'sync', 'bump']);

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry['path'] === 'string' &&
    entry['path'].length > 0 &&
    typeof entry['hash'] === 'string' &&
    typeof entry['agent'] === 'string' &&
    typeof entry['recordedAt'] === 'string' &&
    typeof entry['cause'] === 'string' &&
    CAUSES.has(entry['cause'])
  );
}

/** 逐行读取 JSONL 历史；损坏行跳过并计数，不中断读取。 */
export async function loadHistory(
  fs: FileSystemReader,
  path: string,
): Promise<LoadHistoryResult> {
  const stat = await fs.stat(path);
  if (!stat || !stat.isFile) return { entries: [], skipped: 0 };

  try {
    const raw = await fs.readTextFile(path);
    const entries: HistoryEntry[] = [];
    let skipped = 0;
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const parsed: unknown = JSON.parse(line);
        if (isHistoryEntry(parsed)) {
          entries.push(parsed);
        } else {
          skipped += 1;
        }
      } catch {
        skipped += 1;
      }
    }
    return { entries, skipped };
  } catch (error) {
    return {
      entries: [],
      skipped: 0,
      error: `历史读取失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function serialize(entries: HistoryEntry[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join('\n');
}

/** 追加写入历史文件（保留已有内容，追加后原子替换）。 */
export async function appendHistory(
  fs: FileSystem,
  path: string,
  entries: HistoryEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  let existing = '';
  try {
    existing = await fs.readTextFile(path);
  } catch {
    existing = '';
  }
  const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  await fs.mkdirp(dirName(path));
  await fs.writeTextFileAtomic(path, `${existing}${prefix}${serialize(entries)}\n`);
}

/** 整体重写历史文件（用于清理）。 */
export async function saveHistory(
  fs: FileSystem,
  path: string,
  entries: HistoryEntry[],
): Promise<void> {
  await fs.mkdirp(dirName(path));
  const body = entries.length > 0 ? `${serialize(entries)}\n` : '';
  await fs.writeTextFileAtomic(path, body);
}