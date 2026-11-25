import { dirName } from '../utils/path.js';
import type { FileSystem, FileSystemReader } from '../utils/fs.js';
import type { ManageSkillsIndex, SkillRecord } from '../types/index.js';

export const INDEX_FILE_NAME = 'index.json';

export const INDEX_SCHEMA_VERSION = 2;

/** 可读的历史版本；读取时按最新结构补齐字段。 */
const SUPPORTED_VERSIONS = new Set([1, INDEX_SCHEMA_VERSION]);

export interface LoadIndexResult {
  index: ManageSkillsIndex | null;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 读取索引；版本不认识时返回错误且不提供 index（调用方不得覆盖）。 */
export async function loadIndex(fs: FileSystemReader, path: string): Promise<LoadIndexResult> {
  const stat = await fs.stat(path);
  if (!stat || !stat.isFile) return { index: null };

  try {
    const raw = await fs.readTextFile(path);
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data)) return { index: null, error: '索引格式不正确' };
    if (!SUPPORTED_VERSIONS.has(data['schemaVersion'] as number)) {
      return { index: null, error: `不支持的索引版本：${String(data['schemaVersion'])}` };
    }
    if (!Array.isArray(data['skills'])) return { index: null, error: '索引缺少 skills 数组' };
    const skills = (data['skills'] as SkillRecord[]).map((skill) => ({
      ...skill,
      tagState: skill.tagState ?? { added: [], removed: [] },
    }));
    return {
      index: {
        schemaVersion: INDEX_SCHEMA_VERSION,
        generatedAt: typeof data['generatedAt'] === 'string' ? data['generatedAt'] : '',
        skills,
      },
    };
  } catch (error) {
    return { index: null, error: `索引读取失败：${error instanceof Error ? error.message : String(error)}` };
  }
}

/** 原子写入索引（临时文件 + rename 由 FileSystem 实现保证）。 */
export async function saveIndex(
  fs: FileSystem,
  path: string,
  index: ManageSkillsIndex,
): Promise<void> {
  if (index.schemaVersion !== INDEX_SCHEMA_VERSION) {
    throw new Error(`拒绝写入不支持的索引版本：${index.schemaVersion}`);
  }
  await fs.mkdirp(dirName(path));
  await fs.writeTextFileAtomic(path, `${JSON.stringify(index, null, 2)}\n`);
}

/**
 * 合并本次扫描结果与旧索引：
 * - 同一路径以新记录覆盖，并保留旧记录上的手工字段（分类、标签等）；
 * - 新结果中不存在的旧记录标记 stale 保留，不静默丢弃。
 */
export function mergeScan(
  previous: ManageSkillsIndex | null,
  records: SkillRecord[],
  now: Date = new Date(),
): ManageSkillsIndex {
  const previousByPath = new Map<string, SkillRecord>();
  for (const item of previous?.skills ?? []) {
    previousByPath.set(item.path, item);
  }

  const currentPaths = new Set(records.map((record) => record.path));
  const merged: SkillRecord[] = records.map((record) => {
    const old = previousByPath.get(record.path);
    return old ? { ...old, ...record, stale: false } : record;
  });

  for (const old of previous?.skills ?? []) {
    if (!currentPaths.has(old.path)) {
      merged.push({ ...old, stale: true });
    }
  }

  merged.sort((a, b) => a.path.localeCompare(b.path));
  return {
    schemaVersion: INDEX_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    skills: merged,
  };
}