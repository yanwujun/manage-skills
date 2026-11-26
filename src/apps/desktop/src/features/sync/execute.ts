import { appPaths, copyFile, createDir, readTextFile, statPath, writeTextFileAtomic } from '../../api/fs';
import type { SyncQueueItem } from './queue';

export interface SyncItemResult {
  id: string;
  skillName: string;
  status: 'created' | 'updated' | 'skipped' | 'failed';
  reason?: string;
}

export interface SyncOutcome {
  results: SyncItemResult[];
  backupDir: string;
  summary: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
}

export interface BackupEntry {
  skillName: string;
  originalPath: string;
  backupPath: string;
}

export interface SyncFsDeps {
  getManageSkillsDir: () => Promise<string>;
  readTextFile: (path: string) => Promise<string>;
  statPath: (path: string) => Promise<{ size: number; mtimeMs: number } | null>;
  createDir: (path: string) => Promise<void>;
  copyFile: (from: string, to: string) => Promise<void>;
  writeTextFileAtomic: (path: string, content: string) => Promise<void>;
}

const defaultDeps: SyncFsDeps = {
  async getManageSkillsDir() {
    const paths = await appPaths();
    return paths.manageSkillsDir;
  },
  readTextFile,
  statPath,
  createDir,
  copyFile,
  writeTextFileAtomic,
};

function safeName(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  const dir = parts[parts.length - 2] ?? 'skill';
  const file = parts[parts.length - 1] ?? 'SKILL.md';
  return `${dir}-${file}`.replace(/[^\p{L}\p{N}._-]+/gu, '_');
}

function joinPath(dir: string, ...parts: string[]): string {
  const sep = dir.includes('\\') ? '\\' : '/';
  return [dir.replace(/[\\/]+$/, ''), ...parts].join(sep);
}

/**
 * 逐条执行同步：先备份目标并增量更新 manifest，再原子写入。
 * 单条失败或中途中断不影响旧文件与已写入的 manifest。
 */
export async function executeSyncQueue(
  items: SyncQueueItem[],
  onProgress: (done: number, total: number) => void,
  deps: SyncFsDeps = defaultDeps,
): Promise<SyncOutcome> {
  const manageSkillsDir = await deps.getManageSkillsDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = joinPath(manageSkillsDir, 'backups', stamp);
  const results: SyncItemResult[] = [];
  const entries: BackupEntry[] = [];

  const writeManifest = async () => {
    const manifest = {
      planId: `desktop-${stamp}`,
      createdAt: new Date().toISOString(),
      entries,
    };
    await deps.writeTextFileAtomic(
      joinPath(backupDir, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  };

  for (const [index, item] of items.entries()) {
    if (item.action === 'skip') {
      results.push({ id: item.id, skillName: item.skillName, status: 'skipped' });
      onProgress(index + 1, items.length);
      continue;
    }

    try {
      const content = await deps.readTextFile(item.sourcePath);
      const target = await deps.statPath(item.targetPath);
      if (target) {
        await deps.createDir(backupDir);
        const backupPath = joinPath(backupDir, `${index}-${item.targetInstance}-${safeName(item.targetPath)}`);
        await deps.copyFile(item.targetPath, backupPath);
        entries.push({ skillName: item.skillName, originalPath: item.targetPath, backupPath });
        await writeManifest();
      }
      await deps.writeTextFileAtomic(item.targetPath, content);
      results.push({
        id: item.id,
        skillName: item.skillName,
        status: target ? 'updated' : 'created',
      });
    } catch (error) {
      results.push({
        id: item.id,
        skillName: item.skillName,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    onProgress(index + 1, items.length);
  }

  return {
    results,
    backupDir,
    summary: {
      created: results.filter((r) => r.status === 'created').length,
      updated: results.filter((r) => r.status === 'updated').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
    },
  };
}
