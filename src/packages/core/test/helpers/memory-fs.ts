import { baseName, dirName, normalizePath, utf8Encode } from '../../src/index.js';
import type { FileSystem } from '../../src/index.js';

export interface MemoryFs {
  fs: FileSystem;
  writes: string[];
  files: Map<string, string>;
}

/** 内存文件系统：用于扫描、索引与只读守护测试。 */
export function createMemoryFs(initial: Record<string, string> = {}): MemoryFs {
  const files = new Map<string, string>(
    Object.entries(initial).map(([path, content]) => [normalizePath(path), content]),
  );
  const dirs = new Set<string>();
  for (const path of files.keys()) {
    let dir = dirName(path);
    while (dir && dir !== '/' && dir !== '\\' && !dirs.has(dir)) {
      dirs.add(dir);
      dir = dirName(dir);
    }
  }

  const writes: string[] = [];

  const fs: FileSystem = {
    async readFile(path) {
      const content = files.get(normalizePath(path));
      if (content === undefined) throw new Error(`文件不存在：${path}`);
      return utf8Encode(content);
    },
    async readTextFile(path) {
      const content = files.get(normalizePath(path));
      if (content === undefined) throw new Error(`文件不存在：${path}`);
      return content;
    },
    async stat(path) {
      const normalized = normalizePath(path);
      const content = files.get(normalized);
      if (content !== undefined) {
        return { size: utf8Encode(content).length, mtimeMs: 1000, isFile: true, isDirectory: false };
      }
      if (dirs.has(normalized)) {
        return { size: 0, mtimeMs: 1000, isFile: false, isDirectory: true };
      }
      return null;
    },
    async readDir(path) {
      const parent = normalizePath(path);
      const entries = new Map<string, boolean>();
      for (const file of files.keys()) {
        if (dirName(file) === parent) entries.set(baseName(file), true);
      }
      for (const dir of dirs) {
        if (dirName(dir) === parent) entries.set(baseName(dir), false);
      }
      return [...entries].map(([name, isFile]) => ({
        name,
        isFile,
        isDirectory: !isFile,
      }));
    },
    async writeTextFileAtomic(path, content) {
      writes.push(normalizePath(path));
      files.set(normalizePath(path), content);
    },
    async mkdirp(path) {
      dirs.add(normalizePath(path));
    },
  };

  return { fs, writes, files };
}