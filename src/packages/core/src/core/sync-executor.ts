import { sha256Hex } from '../utils/sha256.js';
import { utf8Decode } from '../utils/encoding.js';
import { dirName, isUnderPath, joinPath, normalizePath } from '../utils/path.js';
import type { FileSystem } from '../utils/fs.js';
import type { SyncPlan, SyncPlanItem } from './sync.js';

export type SyncItemOutcome = 'created' | 'updated' | 'skipped' | 'failed';

export interface SyncItemResult {
  id: string;
  skillName: string;
  status: SyncItemOutcome;
  reason?: string;
}

export interface BackupEntry {
  skillName: string;
  originalPath: string;
  backupPath: string;
  hash: string;
}

export interface BackupManifest {
  planId: string;
  createdAt: string;
  entries: BackupEntry[];
}

export interface SyncExecutionCounts {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

export interface SyncExecutionReport {
  planId: string;
  backupDir?: string;
  results: SyncItemResult[];
  counts: SyncExecutionCounts;
}

export interface SyncExecuteOptions {
  /** 备份根目录（通常是 ~/.manage-skills/backups） */
  backupRoot: string;
  /** 允许写入的实例根目录；为空时不校验 */
  allowedRoots?: string[];
  /** 只读 hub，任何目标都不得位于其下 */
  readOnlyHubs?: string[];
  /** 备份目录名（默认由时间生成） */
  timestamp?: string;
  now?: Date;
}

function timestampOf(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

function backupName(path: string, index: number): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  const directory = parts[parts.length - 2] ?? 'skill';
  const file = parts[parts.length - 1] ?? 'SKILL.md';
  const clean = `${directory}-${file}`.replace(/[^\p{L}\p{N}._-]+/gu, '_');
  return `${index}-${clean}`;
}

async function hashOfFile(fs: FileSystem, path: string): Promise<string | null> {
  const stat = await fs.stat(path);
  if (!stat || !stat.isFile) return null;
  return sha256Hex(await fs.readFile(path));
}

function gateError(
  item: SyncPlanItem,
  options: SyncExecuteOptions,
  isSymbolicLink: boolean,
): string | null {
  const target = normalizePath(item.targetPath);
  const readOnly = (options.readOnlyHubs ?? []).map((path) => normalizePath(path));
  if (readOnly.some((hub) => isUnderPath(target, hub))) return '目标位于只读 hub，拒绝写入';

  const allowed = (options.allowedRoots ?? []).map((path) => normalizePath(path));
  if (allowed.length > 0 && !allowed.some((root) => isUnderPath(target, root))) {
    return '目标不在已授权的实例目录内';
  }
  if (isSymbolicLink) return '目标是符号链接，拒绝覆盖';
  return null;
}

function countResults(results: SyncItemResult[]): SyncExecutionCounts {
  const counts: SyncExecutionCounts = { created: 0, updated: 0, skipped: 0, failed: 0 };
  for (const result of results) counts[result.status] += 1;
  return counts;
}

async function executeItem(
  fs: FileSystem,
  item: SyncPlanItem,
  options: SyncExecuteOptions,
  backupDir: string,
  entries: BackupEntry[],
): Promise<SyncItemResult> {
  const base = { id: item.id, skillName: item.skillName };
  const targetStat = await fs.stat(item.targetPath);

  const gate = gateError(item, options, Boolean(targetStat?.isSymbolicLink));
  if (gate) return { ...base, status: 'failed', reason: gate };

  const sourceHash = await hashOfFile(fs, item.sourcePath);
  if (sourceHash === null) return { ...base, status: 'failed', reason: '来源文件不存在' };
  if (sourceHash !== item.sourceHash) {
    return { ...base, status: 'skipped', reason: '来源文件在计划后被修改' };
  }

  const targetExists = Boolean(targetStat?.isFile);
  if (targetExists) {
    const targetHash = await hashOfFile(fs, item.targetPath);
    if (targetHash === sourceHash) {
      return { ...base, status: 'skipped', reason: '目标已是最新' };
    }
    if (item.targetHash && targetHash !== item.targetHash) {
      return { ...base, status: 'skipped', reason: '目标文件在计划后被修改' };
    }
  }

  const sourceBytes = await fs.readFile(item.sourcePath);
  const content = utf8Decode(sourceBytes);

  try {
    if (targetExists) {
      const oldBytes = await fs.readFile(item.targetPath);
      const backupPath = joinPath(backupDir, backupName(item.targetPath, entries.length));
      await fs.mkdirp(backupDir);
      await fs.writeTextFileAtomic(backupPath, utf8Decode(oldBytes));
      entries.push({
        skillName: item.skillName,
        originalPath: item.targetPath,
        backupPath,
        hash: sha256Hex(oldBytes),
      });
    }

    await fs.mkdirp(dirName(item.targetPath));
    if (item.linkMode === 'symlink') {
      if (!fs.symlink) throw new Error('当前环境不支持符号链接落地；请改用 copy 模式');
      if (targetExists) await fs.removeFile?.(item.targetPath);
      await fs.symlink(item.sourcePath, item.targetPath);
    } else {
      await fs.writeTextFileAtomic(item.targetPath, content);
    }
    return { ...base, status: targetExists ? 'updated' : 'created' };
  } catch (error) {
    return {
      ...base,
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 执行同步计划：
 * - 单条失败不影响其余条目；
 * - 覆盖前写入时间戳备份目录并生成 manifest；
 * - 执行期间持有锁文件，防止并发写同一目标。
 */
export async function executeSyncPlan(
  fs: FileSystem,
  plan: SyncPlan,
  options: SyncExecuteOptions,
): Promise<SyncExecutionReport> {
  const now = options.now ?? new Date();
  const backupDir = joinPath(options.backupRoot, options.timestamp ?? timestampOf(now));
  const lockPath = joinPath(options.backupRoot, '.lock');

  if (await fs.stat(lockPath)) {
    throw new Error('已有同步任务在执行（检测到锁文件）；如确认无任务，请删除 .lock 后重试');
  }

  await fs.mkdirp(options.backupRoot);
  await fs.writeTextFileAtomic(lockPath, now.toISOString());

  const results: SyncItemResult[] = [];
  const entries: BackupEntry[] = [];

  try {
    for (const item of plan.items) {
      if (item.status !== 'pending') {
        results.push({
          id: item.id,
          skillName: item.skillName,
          status: 'skipped',
          reason: item.status === 'conflict' ? '冲突尚未选择' : '已标记跳过',
        });
        continue;
      }
      results.push(await executeItem(fs, item, options, backupDir, entries));
    }
  } finally {
    await fs.removeFile?.(lockPath);
  }

  if (entries.length > 0) {
    const manifest: BackupManifest = { planId: plan.id, createdAt: now.toISOString(), entries };
    await fs.mkdirp(backupDir);
    await fs.writeTextFileAtomic(
      joinPath(backupDir, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }

  return {
    planId: plan.id,
    ...(entries.length > 0 ? { backupDir } : {}),
    results,
    counts: countResults(results),
  };
}

export interface RestoreOptions {
  skillName?: string;
  now?: Date;
}

export interface RestoreResult {
  path: string;
  status: 'restored' | 'failed';
  reason?: string;
}

export interface RestoreReport {
  results: RestoreResult[];
  restored: number;
  failed: number;
}

/**
 * 恢复备份：恢复前先把当前状态二次备份到 `<备份目录>/pre-restore/<时间戳>/`，
 * 避免「恢复本身造成丢失」。
 */
export async function restoreBackup(
  fs: FileSystem,
  backupDir: string,
  manifest: BackupManifest,
  options: RestoreOptions = {},
): Promise<RestoreReport> {
  const entries = options.skillName
    ? manifest.entries.filter((entry) => entry.skillName === options.skillName)
    : manifest.entries;
  const preRestoreDir = joinPath(
    backupDir,
    'pre-restore',
    timestampOf(options.now ?? new Date()),
  );

  const results: RestoreResult[] = [];
  for (const [index, entry] of entries.entries()) {
    try {
      const current = await fs.stat(entry.originalPath);
      if (current?.isFile) {
        const currentBytes = await fs.readFile(entry.originalPath);
        await fs.mkdirp(preRestoreDir);
        await fs.writeTextFileAtomic(
          joinPath(preRestoreDir, backupName(entry.originalPath, index)),
          utf8Decode(currentBytes),
        );
      }
      const backupContent = await fs.readTextFile(entry.backupPath);
      await fs.mkdirp(dirName(entry.originalPath));
      await fs.writeTextFileAtomic(entry.originalPath, backupContent);
      results.push({ path: entry.originalPath, status: 'restored' });
    } catch (error) {
      results.push({
        path: entry.originalPath,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    results,
    restored: results.filter((item) => item.status === 'restored').length,
    failed: results.filter((item) => item.status === 'failed').length,
  };
}

/** 显式删除单个目标：先备份再移除，不做自动删除。 */
export async function pruneSkill(
  fs: FileSystem,
  targetPath: string,
  options: { backupRoot: string; now?: Date },
): Promise<{ pruned: boolean; backupPath?: string }> {
  const stat = await fs.stat(targetPath);
  if (!stat?.isFile) return { pruned: false };

  const backupDir = joinPath(options.backupRoot, `prune-${timestampOf(options.now ?? new Date())}`);
  const backupPath = joinPath(backupDir, backupName(targetPath, 0));
  await fs.mkdirp(backupDir);
  await fs.writeTextFileAtomic(backupPath, await fs.readTextFile(targetPath));
  await fs.removeFile?.(targetPath);
  return { pruned: true, backupPath };
}