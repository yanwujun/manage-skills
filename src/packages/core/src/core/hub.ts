import { parseSkillFile } from './frontmatter.js';
import { sha256Hex } from '../utils/sha256.js';
import { utf8Decode } from '../utils/encoding.js';
import { joinPath, baseName } from '../utils/path.js';
import type { FileSystemReader } from '../utils/fs.js';
import type { AgentId, SkillRecord } from '../types/index.js';

export type HubLayout = 'root' | 'skills';

export interface HubSkill {
  name: string;
  path: string;
  relativePath: string;
  hash: string;
  size: number;
  mtimeMs: number;
}

export interface HubScanResult {
  layout: HubLayout;
  skills: HubSkill[];
}

export interface DiffSide {
  path: string;
  hash: string;
  mtimeMs: number;
  size: number;
  /** 仅在 full 模式下填充 */
  content?: string;
}

export interface DiffEntry {
  skillName: string;
  hub?: DiffSide;
  spokes: Array<DiffSide & { instanceId: string; agent: AgentId }>;
}

export interface HubDiffReport {
  generatedAt: string;
  hubRoot: string;
  layout: HubLayout;
  full: boolean;
  onlyInHub: DiffEntry[];
  onlyInSpoke: DiffEntry[];
  drift: DiffEntry[];
  counts: {
    onlyInHub: number;
    onlyInSpoke: number;
    drift: number;
    total: number;
  };
}

export interface HubDiffOptions {
  full?: boolean;
  now?: Date;
}

async function isDirectory(fs: FileSystemReader, path: string): Promise<boolean> {
  const stat = await fs.stat(path);
  return Boolean(stat?.isDirectory);
}

async function readHubSkill(
  fs: FileSystemReader,
  root: string,
  dirName: string,
): Promise<HubSkill | null> {
  const path = joinPath(root, dirName, 'SKILL.md');
  const stat = await fs.stat(path);
  if (!stat || !stat.isFile) return null;

  const bytes = await fs.readFile(path);
  const parsed = parseSkillFile(utf8Decode(bytes));
  return {
    name: parsed.frontmatter.name ?? dirName,
    path,
    relativePath: joinPath(dirName, 'SKILL.md'),
    hash: sha256Hex(bytes),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

/** 识别 hub 布局并扫描其中全部技能（`<name>/SKILL.md` 或 `skills/<name>/SKILL.md`）。 */
export async function scanHub(fs: FileSystemReader, hubRoot: string): Promise<HubScanResult> {
  const skillsDir = joinPath(hubRoot, 'skills');
  const layout: HubLayout = (await isDirectory(fs, skillsDir)) ? 'skills' : 'root';
  const scanRoot = layout === 'skills' ? skillsDir : hubRoot;

  const entries = await fs.readDir(scanRoot);
  const skills: HubSkill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory) continue;
    const skill = await readHubSkill(fs, scanRoot, entry.name);
    if (skill) skills.push(skill);
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return { layout, skills };
}

function recordToSpoke(record: SkillRecord): DiffSide & { instanceId: string; agent: AgentId } {
  return {
    path: record.path,
    hash: record.hash,
    mtimeMs: record.mtimeMs,
    size: record.size,
    instanceId: record.instanceId,
    agent: record.agent,
  };
}

function skillNameOf(record: SkillRecord): string {
  return record.frontmatter.name ?? baseName(record.relativePath.replace(/\/SKILL\.md$/i, ''));
}

/** 计算 spoke 与 hub 的三类差异。 */
export async function buildHubDiff(
  fs: FileSystemReader,
  hubRoot: string,
  spokeRecords: SkillRecord[],
  options: HubDiffOptions = {},
): Promise<HubDiffReport> {
  const hub = await scanHub(fs, hubRoot);

  const hubByName = new Map<string, HubSkill>();
  for (const skill of hub.skills) {
    if (!hubByName.has(skill.name)) hubByName.set(skill.name, skill);
  }

  const spokesByName = new Map<string, SkillRecord[]>();
  for (const record of spokeRecords) {
    const name = skillNameOf(record);
    const list = spokesByName.get(name);
    if (list) list.push(record);
    else spokesByName.set(name, [record]);
  }

  const readContent = async (path: string): Promise<string | undefined> => {
    if (!options.full) return undefined;
    try {
      return await fs.readTextFile(path);
    } catch {
      return undefined;
    }
  };

  const toSide = async (
    skill: HubSkill,
  ): Promise<DiffSide> => {
    const content = await readContent(skill.path);
    return {
      path: skill.path,
      hash: skill.hash,
      mtimeMs: skill.mtimeMs,
      size: skill.size,
      ...(content !== undefined ? { content } : {}),
    };
  };

  const toSpokeSide = async (
    record: SkillRecord,
  ): Promise<DiffSide & { instanceId: string; agent: AgentId }> => {
    const content = await readContent(record.path);
    return { ...recordToSpoke(record), ...(content !== undefined ? { content } : {}) };
  };

  const onlyInHub: DiffEntry[] = [];
  const onlyInSpoke: DiffEntry[] = [];
  const drift: DiffEntry[] = [];

  for (const [name, skill] of hubByName) {
    const spokes = spokesByName.get(name);
    if (!spokes || spokes.length === 0) {
      onlyInHub.push({ skillName: name, hub: await toSide(skill), spokes: [] });
      continue;
    }
    const differing = spokes.filter((record) => record.hash !== skill.hash);
    if (differing.length === 0) continue;
    drift.push({
      skillName: name,
      hub: await toSide(skill),
      spokes: await Promise.all(differing.map(toSpokeSide)),
    });
  }

  for (const [name, spokes] of spokesByName) {
    if (hubByName.has(name)) continue;
    onlyInSpoke.push({
      skillName: name,
      spokes: await Promise.all(spokes.map(toSpokeSide)),
    });
  }

  const sortByName = (a: DiffEntry, b: DiffEntry): number => a.skillName.localeCompare(b.skillName);
  onlyInHub.sort(sortByName);
  onlyInSpoke.sort(sortByName);
  drift.sort(sortByName);

  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    hubRoot,
    layout: hub.layout,
    full: options.full ?? false,
    onlyInHub,
    onlyInSpoke,
    drift,
    counts: {
      onlyInHub: onlyInHub.length,
      onlyInSpoke: onlyInSpoke.length,
      drift: drift.length,
      total: onlyInHub.length + onlyInSpoke.length + drift.length,
    },
  };
}

/** 远程 hub 判定：带协议前缀或以 git@ 开头。 */
export function isRemoteHub(hub: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(hub) || /^git@/.test(hub);
}

/** 由调用方注入的 git 能力（core 不直接执行子进程）。 */
export interface GitRunner {
  clone(url: string, targetDir: string): Promise<void>;
  pull?(dir: string): Promise<void>;
}

export interface ResolveHubOptions {
  /** 远程 hub 的本地缓存目录 */
  cacheDir: string;
  git?: GitRunner;
}

/** 本地目录直接使用；远程仓库经 git 克隆/更新到缓存目录后再扫描。 */
export async function resolveHub(
  fs: FileSystemReader,
  hub: string,
  options: ResolveHubOptions,
): Promise<{ root: string; cloned: boolean }> {
  if (!isRemoteHub(hub)) {
    if (!(await isDirectory(fs, hub))) {
      throw new Error(`hub 目录不存在：${hub}`);
    }
    return { root: hub, cloned: false };
  }

  if (!options.git) {
    throw new Error('hub 为远程仓库，但未提供 git 访问能力');
  }

  const cached = await isDirectory(fs, options.cacheDir);
  try {
    if (cached) {
      await options.git.pull?.(options.cacheDir);
    } else {
      await options.git.clone(hub, options.cacheDir);
    }
  } catch (error) {
    throw new Error(
      `无法访问 hub 仓库：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { root: options.cacheDir, cloned: true };
}