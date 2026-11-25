export interface FsEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

export interface FileStat {
  size: number;
  mtimeMs: number;
  isFile: boolean;
  isDirectory: boolean;
}

/** 只读文件系统能力：扫描与审计只需它。 */
export interface FileSystemReader {
  readFile(path: string): Promise<Uint8Array>;
  readTextFile(path: string): Promise<string>;
  stat(path: string): Promise<FileStat | null>;
  readDir(path: string): Promise<FsEntry[]>;
}

/** 可写文件系统能力：仅索引持久化等少数入口使用。 */
export interface FileSystem extends FileSystemReader {
  writeTextFileAtomic(path: string, content: string): Promise<void>;
  mkdirp(path: string): Promise<void>;
  removeFile?(path: string): Promise<void>;
}