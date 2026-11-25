import { parseSkillFile } from './frontmatter.js';
import { sha256Hex } from '../utils/sha256.js';
import { utf8Decode } from '../utils/encoding.js';
import { baseName, dirName, joinPath, relativeTo } from '../utils/path.js';
import type { FileSystemReader } from '../utils/fs.js';
import type { AgentInstance, SkillRecord } from '../types/index.js';

export interface ScanOptions {
  /** 技能目录最大递归深度，默认 4（覆盖 <category>/<name>/SKILL.md） */
  maxDepth?: number;
}

const SKILL_FILE = 'SKILL.md';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function collectSkillFiles(
  fs: FileSystemReader,
  dir: string,
  depth: number,
  maxDepth: number,
  out: string[],
): Promise<void> {
  let entries;
  try {
    entries = await fs.readDir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = joinPath(dir, entry.name);
    if (entry.isDirectory) {
      if (depth < maxDepth) {
        await collectSkillFiles(fs, child, depth + 1, maxDepth, out);
      }
    } else if (entry.isFile && entry.name === SKILL_FILE) {
      out.push(child);
    }
  }
}

async function readSkill(
  fs: FileSystemReader,
  instance: AgentInstance,
  path: string,
): Promise<SkillRecord> {
  const relativePath = relativeTo(path, instance.root);
  const base = {
    id: `${instance.id}:${relativePath}`,
    instanceId: instance.id,
    agent: instance.agent,
    root: instance.root,
    path,
    relativePath,
  };

  try {
    const bytes = await fs.readFile(path);
    const stat = await fs.stat(path);
    const parsed = parseSkillFile(utf8Decode(bytes));
    return {
      ...base,
      hash: sha256Hex(bytes),
      size: stat?.size ?? bytes.length,
      mtimeMs: stat?.mtimeMs ?? 0,
      frontmatter: {
        ...parsed.frontmatter,
        name: parsed.frontmatter.name ?? baseName(dirName(path)),
      },
      status: parsed.status,
      ...(parsed.error ? { error: parsed.error } : {}),
    };
  } catch (error) {
    return {
      ...base,
      hash: '',
      size: 0,
      mtimeMs: 0,
      frontmatter: {},
      status: 'invalid',
      error: `读取失败：${errorMessage(error)}`,
    };
  }
}

/** 扫描单个实例，返回其下全部技能记录。 */
export async function scanInstance(
  fs: FileSystemReader,
  instance: AgentInstance,
  options: ScanOptions = {},
): Promise<SkillRecord[]> {
  const files: string[] = [];
  await collectSkillFiles(fs, instance.root, 0, options.maxDepth ?? 4, files);
  const records: SkillRecord[] = [];
  for (const file of files) {
    records.push(await readSkill(fs, instance, file));
  }
  return records;
}

/** 扫描全部实例，返回按路径排序的记录集合。 */
export async function scanInstances(
  fs: FileSystemReader,
  instances: AgentInstance[],
  options: ScanOptions = {},
): Promise<SkillRecord[]> {
  const records: SkillRecord[] = [];
  for (const instance of instances) {
    records.push(...(await scanInstance(fs, instance, options)));
  }
  return records.sort((a, b) => a.path.localeCompare(b.path));
}