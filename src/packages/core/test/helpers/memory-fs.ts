import { baseName, dirName, normalizePath, utf8Encode } from '../../src/index.js';
import type { FileSystem } from '../../src/index.js';

export interface MemoryFs {
  fs: FileSystem;
  writes: string[];
  files: Map<string, string>;
  links: Map<string, string>;
}

/** 内存文件系统：用于扫描、索引与只读守护测试。 */
export function createMemoryFs(
  initial: Record<string, string> = {},
  initialLinks: Record<string, string> = {},
): MemoryFs {
  const files = new Map<string, string>(
    Object.entries(initial).map(([path, content]) => [normalizePath(path), content]),
  );
  const links = new Map<string, string>(
    Object.entries(initialLinks).map(([linkPath, target]) => [normalizePath(linkPath), normalizePath(target)]),
  );
  const dirs = new Set<string>();
  for (const path of [...files.keys(), ...links.keys()]) {
    let dir = dirName(path);
    while (dir && dir !== '/' && dir !== '\\' && !dirs.has(dir)) {
      dirs.add(dir);
      dir = dirName(dir);
    }
  }

  const writes: string[] = [];

  const resolve = (path: string): string => {
    const normalized = normalizePath(path);
    const target = links.get(normalized);
    return target ? resolveContent(target) : normalized;
  };

  const resolveContent = (path: string): string => {
    const normalized = normalizePath(path);
    const target = links.get(normalized);
    return target ? resolveContent(target) : normalized;
  };

  const readContent = (path: string): string | undefined => {
    const normalized = resolve(path);
    return files.get(normalized);
  };

  const fs: FileSystem = {
    async readFile(path) {
      const content = readContent(path);
      if (content === undefined) throw new Error(`文件不存在：${path}`);
      return utf8Encode(content);
    },
    async readTextFile(path) {
      const content = readContent(path);
      if (content === undefined) throw new Error(`文件不存在：${path}`);
      return content;
    },
    async stat(path) {
      const normalized = normalizePath(path);
      const linkTarget = links.get(normalized);
      if (linkTarget) {
        const targetContent = files.get(resolve(normalized));
        if (targetContent === undefined) return null;
        return {
          size: utf8Encode(targetContent).length,
          mtimeMs: 1000,
          isFile: true,
          isDirectory: false,
          isSymbolicLink: true,
        };
      }
      const content = files.get(normalized);
      if (content !== undefined) {
        return {
          size: utf8Encode(content).length,
          mtimeMs: 1000,
          isFile: true,
          isDirectory: false,
          isSymbolicLink: false,
        };
      }
      if (dirs.has(normalized)) {
        return { size: 0, mtimeMs: 1000, isFile: false, isDirectory: true, isSymbolicLink: false };
      }
      return null;
    },
    async lstat(path) {
      const normalized = normalizePath(path);
      if (links.has(normalized)) {
        return { size: 0, mtimeMs: 1000, isFile: false, isDirectory: false, isSymbolicLink: true };
      }
      return this.stat(normalized);
    },
    async readDir(path) {
      const parent = normalizePath(path);
      const entries = new Map<string, boolean>();
      for (const file of files.keys()) {
        if (dirName(file) === parent) entries.set(baseName(file), true);
      }
      for (const link of links.keys()) {
        if (dirName(link) === parent) entries.set(baseName(link), true);
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
    async removeFile(path) {
      const normalized = normalizePath(path);
      files.delete(normalized);
      links.delete(normalized);
    },
    async symlink(target, linkPath) {
      const normalized = normalizePath(linkPath);
      links.set(normalized, normalizePath(target));
    },
    async readlink(path) {
      const target = links.get(normalizePath(path));
      if (!target) throw new Error(`不是符号链接：${path}`);
      return target;
    },
  };

  return { fs, writes, files, links };
}