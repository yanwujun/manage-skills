import { joinPath } from '../utils/path.js';
import type { FileSystem, FileSystemReader } from '../utils/fs.js';

export const BLOB_DIR_NAME = 'blobs';

function blobPath(dir: string, hash: string): string {
  return joinPath(dir, `${hash}.md`);
}

/** 写入内容寻址快照；同一 hash 只写一次。返回是否实际写入。 */
export async function writeBlob(
  fs: FileSystem,
  dir: string,
  hash: string,
  content: string,
): Promise<boolean> {
  if (!hash) throw new Error('快照 hash 不能为空');
  const path = blobPath(dir, hash);
  const stat = await fs.stat(path);
  if (stat?.isFile) return false;

  await fs.mkdirp(dir);
  await fs.writeTextFileAtomic(path, content);
  return true;
}

/** 按 hash 读取快照；不存在或读取失败返回 null。 */
export async function readBlob(
  fs: FileSystemReader,
  dir: string,
  hash: string,
): Promise<string | null> {
  if (!hash) return null;
  try {
    return await fs.readTextFile(blobPath(dir, hash));
  } catch {
    return null;
  }
}

export async function hasBlob(
  fs: FileSystemReader,
  dir: string,
  hash: string,
): Promise<boolean> {
  const stat = await fs.stat(blobPath(dir, hash));
  return Boolean(stat?.isFile);
}

/** 删除指定快照（不存在时静默）。 */
export async function removeBlob(
  fs: FileSystem,
  dir: string,
  hash: string,
): Promise<void> {
  await fs.removeFile?.(blobPath(dir, hash));
}

/** 列出快照目录下全部 hash（文件名去掉 .md）。 */
export async function listBlobHashes(
  fs: FileSystemReader,
  dir: string,
): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readDir(dir);
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile && entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -3))
    .sort();
}