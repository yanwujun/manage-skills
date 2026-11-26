import { invoke } from '@tauri-apps/api/core';

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
  isSymlink: boolean;
}

export interface WslDistro {
  name: string;
  reachable: boolean;
}

export interface AppPaths {
  home: string;
  manageSkillsDir: string;
  index: string;
  similarity: string;
  history: string;
}

export const appPaths = (): Promise<AppPaths> => invoke<AppPaths>('app_paths');
export const allowRoot = (path: string): Promise<void> => invoke('allow_root', { path });
export const readDir = (path: string): Promise<FsEntry[]> => invoke('read_dir', { path });
export const readTextFile = (path: string): Promise<string> =>
  invoke<string>('read_text_file', { path });
export const statPath = (path: string): Promise<FileStat | null> => invoke('stat', { path });
export const listWslDistros = (): Promise<WslDistro[]> => invoke('list_wsl_distros');
export const writeTextFileAtomic = (path: string, content: string): Promise<void> =>
  invoke('write_text_file_atomic', { path, content });
export const createDir = (path: string): Promise<void> => invoke('create_dir', { path });
export const copyFile = (from: string, to: string): Promise<void> =>
  invoke('copy_file', { from, to });
export const removeFile = (path: string): Promise<void> => invoke('remove_file', { path });