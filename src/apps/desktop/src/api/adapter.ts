import {
  discoverInstances,
  mergeScan,
  saveIndex,
  scanInstances,
  type FileSystem,
  type PlatformEnv,
  type SkillRecord,
} from '@manage-skills/core';
import {
  appPaths,
  createDir,
  readDir,
  readTextFile,
  removeFile,
  statPath,
  writeTextFileAtomic,
} from './fs';

/** 基于 Tauri 命令的 FileSystem 实现，供 core 引擎调用。 */
export function createDesktopFs(): FileSystem {
  return {
    async readFile(path) {
      return new TextEncoder().encode(await readTextFile(path));
    },
    readTextFile: (path) => readTextFile(path),
    async stat(path) {
      const stat = await statPath(path);
      if (!stat) return null;
      return {
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        isFile: stat.isFile,
        isDirectory: stat.isDirectory,
        isSymbolicLink: stat.isSymlink,
      };
    },
    readDir: (path) => readDir(path),
    writeTextFileAtomic: (path, content) => writeTextFileAtomic(path, content),
    mkdirp: (path) => createDir(path),
    removeFile: (path) => removeFile(path),
  };
}

/** 扫描全部 agent 目录并把结果写入索引（与 CLI 的 scan 结果结构一致）。 */
export async function scanAndSaveIndex(): Promise<{ skills: SkillRecord[]; scanned: number }> {
  const paths = await appPaths();
  const fs = createDesktopFs();
  const env: PlatformEnv = {
    platform: 'win32',
    homedir: paths.home,
    pathExists: () => true,
  };

  const instances = discoverInstances(env, {});
  const records = await scanInstances(fs, instances);
  const index = mergeScan(null, records);
  await saveIndex(fs, paths.index, index);

  return { skills: index.skills, scanned: records.length };
}