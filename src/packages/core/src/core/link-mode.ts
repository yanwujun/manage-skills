import { baseName, dirName, joinPath } from '../utils/path.js';
import type { FileSystem } from '../utils/fs.js';

export type LinkMode = 'copy' | 'symlink';

export interface LinkProbe {
  supported: boolean;
  reason?: string;
}

/** 通过试写临时链接探测当前环境是否支持符号链接。 */
export async function probeSymlinkSupport(fs: FileSystem, dir: string): Promise<LinkProbe> {
  if (!fs.symlink || !fs.removeFile) {
    return { supported: false, reason: '当前文件系统实现不支持符号链接' };
  }
  const probe = joinPath(dir, `.manage-skills-link-probe-${Date.now()}`);
  try {
    await fs.mkdirp(dir);
    await fs.symlink(joinPath(dir, 'target'), probe);
    await fs.removeFile(probe);
    return { supported: true };
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** 按模式落地：copy 写独立副本，symlink 创建链接；不支持时明确报错，不静默降级。 */
export async function createLink(
  fs: FileSystem,
  sourcePath: string,
  targetPath: string,
  mode: LinkMode,
): Promise<void> {
  await fs.mkdirp(dirName(targetPath));
  if (mode === 'copy') {
    await fs.writeTextFileAtomic(targetPath, await fs.readTextFile(sourcePath));
    return;
  }
  if (!fs.symlink) {
    throw new Error('当前环境不支持符号链接落地；请改用 copy 模式');
  }
  await fs.symlink(sourcePath, targetPath);
}

export interface SwitchResult {
  previous: LinkMode | 'missing';
  backupPath?: string;
}

/**
 * 切换落地方式：先备份旧形态，再替换，保证目录中只保留一种形态。
 * 已是目标形态时不做任何写入。
 */
export async function switchLinkMode(
  fs: FileSystem,
  sourcePath: string,
  targetPath: string,
  mode: LinkMode,
  options: { backupDir: string },
): Promise<SwitchResult> {
  const linkStat = await fs.lstat?.(targetPath);
  const normalStat = await fs.stat(targetPath);

  let previous: LinkMode | 'missing' = 'missing';
  if (linkStat?.isSymbolicLink) previous = 'symlink';
  else if (normalStat?.isFile) previous = 'copy';

  if (previous === 'missing') {
    await createLink(fs, sourcePath, targetPath, mode);
    return { previous };
  }
  if (previous === mode) return { previous };

  const backupPath = joinPath(
    options.backupDir,
    `${baseName(dirName(targetPath))}-${baseName(targetPath)}`,
  );
  await fs.mkdirp(options.backupDir);
  if (previous === 'copy') {
    await fs.writeTextFileAtomic(backupPath, await fs.readTextFile(targetPath));
  } else if (fs.readlink) {
    await fs.writeTextFileAtomic(backupPath, `symlink -> ${await fs.readlink(targetPath)}\n`);
  }

  await fs.removeFile?.(targetPath);
  await createLink(fs, sourcePath, targetPath, mode);
  return { previous, backupPath };
}