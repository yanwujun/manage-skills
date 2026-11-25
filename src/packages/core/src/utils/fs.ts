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
  /** 目标本身是否为符号链接（用于写入前的外指检查） */
  isSymbolicLink?: boolean;
}

/** 只读文件系统能力：扫描与审计只需它。 */
export interface FileSystemReader {
  readFile(path: string): Promise<Uint8Array>;
  readTextFile(path: string): Promise<string>;
  stat(path: string): Promise<FileStat | null>;
  readDir(path: string): Promise<FsEntry[]>;
  /** 不跟随符号链接的状态；不可用时调用方退回 stat */
  lstat?(path: string): Promise<FileStat | null>;
}

/** 可写文件系统能力：仅索引持久化等少数入口使用。 */
export interface FileSystem extends FileSystemReader {
  writeTextFileAtomic(path: string, content: string): Promise<void>;
  mkdirp(path: string): Promise<void>;
  removeFile?(path: string): Promise<void>;
  /** 创建符号链接（平台不支持时由实现决定抛错） */
  symlink?(target: string, linkPath: string): Promise<void>;
  readlink?(path: string): Promise<string>;
}