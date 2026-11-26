import { parseSkillFile } from './frontmatter.js';
import { baseName, dirName, joinPath, normalizePath } from '../utils/path.js';
import { sha256Hex } from '../utils/sha256.js';
import { utf8Decode } from '../utils/encoding.js';
import { listBlobHashes, removeBlob, writeBlob } from '../storage/blob-store.js';
import { appendHistory, loadHistory, saveHistory } from '../storage/history-store.js';
import type { FileSystem, FileSystemReader } from '../utils/fs.js';
import type {
  AgentId,
  HistoryCause,
  HistoryEntry,
  SkillRecord,
  VersionBumpKind,
} from '../types/index.js';

/** 条目对应的技能名：优先 frontmatter name，回退到目录名。 */
export function historyName(entry: HistoryEntry): string {
  return entry.name ?? baseName(dirName(entry.path));
}

/** 每个路径的最后一条历史（按文件顺序，后者覆盖前者）。 */
export function latestByPath(entries: HistoryEntry[]): Map<string, HistoryEntry> {
  const map = new Map<string, HistoryEntry>();
  for (const entry of entries) map.set(entry.path, entry);
  return map;
}

export interface VersionDrift {
  path: string;
  name: string;
  /** 该路径最新一条历史（代表当前内容） */
  latest: HistoryEntry;
  /** 当前 version 段的第一条历史（基线） */
  baseline: HistoryEntry;
}

/**
 * 检出版本漂移：同一路径在「当前 version 段」内内容发生过变化。
 * 基线取该 version 首次出现的条目——扫描会把本次变化立即写入历史，
 * 因此不能用「当前记录 vs 最近一条历史」判定，否则永远判不出漂移。
 */
export function findVersionDrifts(entries: HistoryEntry[]): VersionDrift[] {
  const byPath = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const list = byPath.get(entry.path);
    if (list) {
      list.push(entry);
    } else {
      byPath.set(entry.path, [entry]);
    }
  }

  const drifts: VersionDrift[] = [];
  for (const [path, list] of byPath) {
    const latest = list[list.length - 1]!;
    const version = latest.version ?? '';
    let index = list.length - 1;
    while (index > 0 && (list[index - 1]!.version ?? '') === version) index -= 1;
    const baseline = list[index]!;
    if (baseline.hash === latest.hash) continue;
    drifts.push({ path, name: historyName(latest), latest, baseline });
  }

  return drifts.sort((a, b) => a.path.localeCompare(b.path));
}

export interface DetectHistoryOptions {
  cause?: HistoryCause;
  note?: string;
  now?: Date;
}

/** 对比本次扫描结果与历史，生成需要追加的条目（不改源文件）。 */
export function detectHistoryChanges(
  records: SkillRecord[],
  previous: HistoryEntry[],
  options: DetectHistoryOptions = {},
): HistoryEntry[] {
  const latest = latestByPath(previous);
  const now = options.now ?? new Date();
  const cause = options.cause ?? 'scan';
  const entries: HistoryEntry[] = [];

  for (const record of records) {
    if (!record.hash) continue;
    const last = latest.get(record.path);
    if (last && last.hash === record.hash) continue;
    entries.push({
      path: record.path,
      instanceId: record.instanceId,
      agent: record.agent,
      name: record.frontmatter.name ?? baseName(dirName(record.path)),
      hash: record.hash,
      size: record.size,
      mtimeMs: record.mtimeMs,
      ...(record.frontmatter.version ? { version: record.frontmatter.version } : {}),
      cause,
      ...(options.note ? { note: options.note } : {}),
      recordedAt: now.toISOString(),
    });
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export interface HistoryEntryContext {
  agent: AgentId;
  instanceId?: string;
  cause: HistoryCause;
  note?: string;
  now?: Date;
}

/** 从磁盘上的技能文件构建一条历史条目；读取或解析失败返回 null。 */
export async function buildHistoryEntryFromFile(
  fs: FileSystemReader,
  path: string,
  context: HistoryEntryContext,
): Promise<HistoryEntry | null> {
  try {
    const bytes = await fs.readFile(path);
    const stat = await fs.stat(path);
    const parsed = parseSkillFile(utf8Decode(bytes));
    return {
      path,
      ...(context.instanceId ? { instanceId: context.instanceId } : {}),
      agent: context.agent,
      name: parsed.frontmatter.name ?? baseName(dirName(path)),
      hash: sha256Hex(bytes),
      size: stat?.size ?? bytes.length,
      mtimeMs: stat?.mtimeMs ?? 0,
      ...(parsed.frontmatter.version ? { version: parsed.frontmatter.version } : {}),
      cause: context.cause,
      ...(context.note ? { note: context.note } : {}),
      recordedAt: (context.now ?? new Date()).toISOString(),
    };
  } catch {
    return null;
  }
}

export interface HistoryStoragePaths {
  historyPath: string;
  blobsDir: string;
}

export interface PersistHistoryResult {
  added: HistoryEntry[];
  warnings: string[];
}

/**
 * 持久化历史条目：写入对应快照后追加到历史文件。
 * - 与最近一条同路径同 hash 的条目跳过（防止重复扫描产生重复记录）；
 * - 单个技能读取失败只产生告警，不中断整轮记录；
 * - 只写中央库，不触碰技能源文件。
 */
export async function persistHistoryEntries(
  fs: FileSystemReader & FileSystem,
  paths: HistoryStoragePaths,
  entries: HistoryEntry[],
  previous: HistoryEntry[] = [],
): Promise<PersistHistoryResult> {
  const latest = latestByPath(previous);
  const added: HistoryEntry[] = [];
  const warnings: string[] = [];

  for (const entry of entries) {
    if (latest.get(entry.path)?.hash === entry.hash) continue;
    try {
      const content = await fs.readTextFile(entry.path);
      await writeBlob(fs, paths.blobsDir, entry.hash, content);
      added.push(entry);
    } catch (error) {
      warnings.push(
        `快照写入失败（${entry.path}）：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  await appendHistory(fs, paths.historyPath, added);
  return { added, warnings };
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** 按增量位计算下一个版本号；缺少版本时给 0.1.0，格式不符时报错。 */
export function planVersionBump(current: string | undefined, kind: VersionBumpKind): string {
  if (!current) return '0.1.0';
  const match = SEMVER.exec(current.trim());
  if (!match) {
    throw new Error(`版本号无法解析：${current}（需为三段式，如 1.2.3）`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** 按技能名聚合历史（组内按时间倒序），不合并不同路径的演进。 */
export function groupHistoryByName(entries: HistoryEntry[]): Map<string, HistoryEntry[]> {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const name = historyName(entry);
    const list = groups.get(name);
    if (list) {
      list.push(entry);
    } else {
      groups.set(name, [entry]);
    }
  }
  for (const list of groups.values()) {
    list.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || a.path.localeCompare(b.path));
  }
  return groups;
}

export interface HistoryPurgePaths {
  historyPath: string;
  blobsDir: string;
  /** 评测结果目录；存在时其 fromHash / toHash 也计入引用 */
  evalResultsDir?: string;
}

export interface HistoryPurgeResult {
  removedEntries: number;
  removedBlobs: string[];
  keptBlobs: number;
}

async function collectEvalRefs(
  fs: FileSystemReader,
  dir: string,
  depth = 0,
): Promise<Set<string>> {
  const refs = new Set<string>();
  if (depth > 4) return refs;
  let entries;
  try {
    entries = await fs.readDir(dir);
  } catch {
    return refs;
  }
  for (const entry of entries) {
    const child = joinPath(dir, entry.name);
    if (entry.isDirectory) {
      for (const ref of await collectEvalRefs(fs, child, depth + 1)) refs.add(ref);
      continue;
    }
    if (!entry.isFile || !entry.name.endsWith('.json')) continue;
    try {
      const parsed: unknown = JSON.parse(await fs.readTextFile(child));
      if (typeof parsed !== 'object' || parsed === null) continue;
      const data = parsed as Record<string, unknown>;
      for (const key of ['fromHash', 'toHash']) {
        const value = data[key];
        if (typeof value === 'string' && value) refs.add(value);
      }
    } catch {
      // 损坏的结果文件不阻断回收
    }
  }
  return refs;
}

/**
 * 清理指定技能（名称或路径）的历史，并回收不再被任何历史或评测结果引用的快照。
 */
export async function purgeSkillHistory(
  fs: FileSystem,
  paths: HistoryPurgePaths,
  target: string,
): Promise<HistoryPurgeResult> {
  const loaded = await loadHistory(fs, paths.historyPath);
  const normalizedTarget = normalizePath(target);
  const kept = loaded.entries.filter(
    (entry) =>
      historyName(entry) !== target && normalizePath(entry.path) !== normalizedTarget,
  );
  const removedEntries = loaded.entries.length - kept.length;
  if (removedEntries > 0) await saveHistory(fs, paths.historyPath, kept);

  const referenced = new Set(kept.map((entry) => entry.hash));
  if (paths.evalResultsDir) {
    for (const ref of await collectEvalRefs(fs, paths.evalResultsDir)) referenced.add(ref);
  }

  const removedBlobs: string[] = [];
  let keptBlobs = 0;
  for (const hash of await listBlobHashes(fs, paths.blobsDir)) {
    if (referenced.has(hash)) {
      keptBlobs += 1;
      continue;
    }
    await removeBlob(fs, paths.blobsDir, hash);
    removedBlobs.push(hash);
  }

  return { removedEntries, removedBlobs, keptBlobs };
}