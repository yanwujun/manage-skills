import { appPaths, readDir } from './fs';

export interface ScanProgress {
  scanned: number;
  found: number;
  done: boolean;
}

const SKILL_FILE = 'SKILL.md';
const MAX_DEPTH = 4;

/** 递归统计各 agent 目录下的 SKILL.md 数量，逐目录上报进度。 */
export async function scanSkills(onProgress: (progress: ScanProgress) => void): Promise<number> {
  const paths = await appPaths();
  const roots = [
    `${paths.home}\\.claude\\skills`,
    `${paths.home}\\.cursor\\skills`,
    `${paths.home}\\.codex\\skills`,
    `${paths.home}\\.hermes`,
  ];

  let scanned = 0;
  let found = 0;

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = await readDir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === SKILL_FILE && entry.isFile) {
        found += 1;
        onProgress({ scanned, found, done: false });
      } else if (entry.isDirectory) {
        scanned += 1;
        onProgress({ scanned, found, done: false });
        await walk(`${dir}\\${entry.name}`, depth + 1);
      }
    }
  };

  for (const root of roots) {
    await walk(root, 0);
  }
  onProgress({ scanned, found, done: true });
  return found;
}