import { promises as fsp } from 'node:fs';
import type { FileSystem } from '@manage-skills/core';

/** CLI 侧的文件系统实现（core 通过接口注入）。 */
export function createNodeFs(): FileSystem {
  return {
    async readFile(path) {
      const buffer = await fsp.readFile(path);
      return new Uint8Array(buffer);
    },
    async readTextFile(path) {
      return fsp.readFile(path, 'utf8');
    },
    async stat(path) {
      try {
        const stat = await fsp.stat(path);
        return {
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          isFile: stat.isFile(),
          isDirectory: stat.isDirectory(),
        };
      } catch {
        return null;
      }
    },
    async readDir(path) {
      const entries = await fsp.readdir(path, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
      }));
    },
    async writeTextFileAtomic(path, content) {
      const tmp = `${path}.tmp-${Date.now()}`;
      await fsp.writeFile(tmp, content, 'utf8');
      await fsp.rename(tmp, path);
    },
    async mkdirp(path) {
      await fsp.mkdir(path, { recursive: true });
    },
    async removeFile(path) {
      await fsp.rm(path, { force: true });
    },
  };
}