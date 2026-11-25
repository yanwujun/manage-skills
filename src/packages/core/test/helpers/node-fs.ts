import { promises as fsp } from 'node:fs';
import { dirname } from 'node:path';
import type { FileSystem } from '../../src/index.js';

/** 基于 node:fs 的实现，供基准测试与未来的 CLI 适配层参考。 */
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

export { dirname };