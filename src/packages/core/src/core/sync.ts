import { scanHub } from './hub.js';
import { joinPath, normalizePath, isUnderPath } from '../utils/path.js';
import type { FileSystemReader } from '../utils/fs.js';
import type { AgentId, AgentInstance, SkillRecord } from '../types/index.js';

export type SyncDirection = 'push' | 'pull';
export type SyncAction = 'create' | 'update';
export type SyncResourceType = 'skill' | 'command';
export type SyncLinkMode = 'copy' | 'symlink';
export type SyncSelection = 'hub' | 'spoke' | 'skip';
export type SyncItemStatus = 'pending' | 'conflict' | 'skipped';

export interface SyncPlanItem {
  id: string;
  skillName: string;
  direction: SyncDirection;
  action: SyncAction;
  resourceType: SyncResourceType;
  /** 来源文件绝对路径 */
  sourcePath: string;
  /** 目标文件绝对路径 */
  targetPath: string;
  sourceHash: string;
  /** 目标当前内容 hash；目标不存在时为空 */
  targetHash?: string;
  linkMode: SyncLinkMode;
  agent: AgentId;
  status: SyncItemStatus;
  /** 用户在冲突中的选择 */
  selection?: SyncSelection;
}

export interface SyncPlanCounts {
  create: number;
  update: number;
  link: number;
  skipped: number;
  conflict: number;
  total: number;
}

export interface SyncPlan {
  id: string;
  createdAt: string;
  hubRoot: string;
  direction: SyncDirection;
  items: SyncPlanItem[];
  counts: SyncPlanCounts;
}

export interface SyncPlanOptions {
  id?: string;
  now?: Date;
  direction?: SyncDirection;
  /** 冲突选边：技能名 -> hub / spoke / skip */
  selections?: Record<string, SyncSelection>;
  linkMode?: SyncLinkMode;
  /** 按 agent 覆盖落地方式 */
  linkModeByAgent?: Partial<Record<AgentId, SyncLinkMode>>;
  /** 目标实例（hub 独有技能需要知道同步到哪些 agent 目录） */
  targets?: AgentInstance[];
  /** 只读 hub 根目录；任何写入目标不得位于其下 */
  readOnlyHubs?: string[];
  resourceType?: SyncResourceType;
}

const SYNCABLE_RESOURCES: readonly SyncResourceType[] = ['skill', 'command'];

/** 非同步资源类型（MCP / Hook / 记忆 / 子代理）在这里被拒绝。 */
export function assertSyncableResource(type: string): asserts type is SyncResourceType {
  if (!SYNCABLE_RESOURCES.includes(type as SyncResourceType)) {
    throw new Error(`不支持同步的资源类型：${type}（仅支持 skill / command）`);
  }
}

function skillNameOf(record: SkillRecord): string {
  return record.frontmatter.name ?? record.relativePath.replace(/\/SKILL\.md$/i, '');
}

function emptyCounts(): SyncPlanCounts {
  return { create: 0, update: 0, link: 0, skipped: 0, conflict: 0, total: 0 };
}

function countItem(counts: SyncPlanCounts, item: SyncPlanItem): void {
  if (item.status === 'conflict') counts.conflict += 1;
  else if (item.status === 'skipped') counts.skipped += 1;
  else if (item.action === 'create') counts.create += 1;
  else counts.update += 1;
  if (item.linkMode === 'symlink') counts.link += 1;
  counts.total += 1;
}

function isWriteTargetAllowed(target: string, readOnlyHubs: string[]): boolean {
  return !readOnlyHubs.some((hub) => isUnderPath(target, hub));
}

/**
 * 基于 hub 扫描与 spoke 记录生成同步计划：
 * - push：hub 有、spoke 无 → create；drift 由选边决定方向；
 * - pull：spoke 有、hub 无 → create（回收）；
 * - 未选边的 drift 以 conflict 状态进入计划，等待用户决定；
 * - 目标位于只读 hub 之下的条目不生成。
 */
export async function buildSyncPlan(
  fs: FileSystemReader,
  hubRoot: string,
  spokeRecords: SkillRecord[],
  options: SyncPlanOptions = {},
): Promise<SyncPlan> {
  const resourceType = options.resourceType ?? 'skill';
  assertSyncableResource(resourceType);

  const hub = await scanHub(fs, hubRoot);
  const direction = options.direction ?? 'push';
  const selections = options.selections ?? {};
  const readOnlyHubs = (options.readOnlyHubs ?? []).map((path) => normalizePath(path));
  const createdAt = (options.now ?? new Date()).toISOString();
  const id = options.id ?? `plan-${Date.now().toString(36)}`;
  const targets = options.targets ?? [];

  const hubByName = new Map(hub.skills.map((skill) => [skill.name, skill]));
  const spokesByName = new Map<string, SkillRecord[]>();
  for (const record of spokeRecords) {
    const name = skillNameOf(record);
    const list = spokesByName.get(name);
    if (list) list.push(record);
    else spokesByName.set(name, [record]);
  }

  const linkModeFor = (agent: AgentId): SyncLinkMode =>
    options.linkModeByAgent?.[agent] ?? options.linkMode ?? 'copy';

  const items: SyncPlanItem[] = [];

  for (const [name, hubSkill] of hubByName) {
    const spokes = spokesByName.get(name) ?? [];

    if (spokes.length === 0) {
      if (direction !== 'push') continue;
      for (const target of targets) {
        const targetPath = joinPath(target.root, hubSkill.relativePath);
        if (!isWriteTargetAllowed(targetPath, readOnlyHubs)) continue;
        items.push({
          id: `create:${name}:${target.id}`,
          skillName: name,
          direction: 'push',
          action: 'create',
          resourceType,
          sourcePath: hubSkill.path,
          targetPath,
          sourceHash: hubSkill.hash,
          linkMode: linkModeFor(target.agent),
          agent: target.agent,
          status: 'pending',
        });
      }
      continue;
    }

    for (const spoke of spokes) {
      if (spoke.hash === hubSkill.hash) continue;

      const selection = selections[name];
      const base = {
        skillName: name,
        resourceType,
        linkMode: linkModeFor(spoke.agent),
        agent: spoke.agent,
      };

      if (!selection) {
        items.push({
          ...base,
          id: `conflict:${name}:${spoke.instanceId}`,
          direction: 'push',
          action: 'update',
          sourcePath: hubSkill.path,
          targetPath: spoke.path,
          sourceHash: hubSkill.hash,
          targetHash: spoke.hash,
          status: 'conflict',
        });
        continue;
      }

      if (selection === 'skip') {
        items.push({
          ...base,
          id: `skip:${name}:${spoke.instanceId}`,
          direction: 'push',
          action: 'update',
          sourcePath: hubSkill.path,
          targetPath: spoke.path,
          sourceHash: hubSkill.hash,
          targetHash: spoke.hash,
          status: 'skipped',
          selection,
        });
        continue;
      }

      if (selection === 'hub') {
        items.push({
          ...base,
          id: `push:${name}:${spoke.instanceId}`,
          direction: 'push',
          action: 'update',
          sourcePath: hubSkill.path,
          targetPath: spoke.path,
          sourceHash: hubSkill.hash,
          targetHash: spoke.hash,
          status: 'pending',
          selection,
        });
      } else {
        const targetPath = joinPath(hubRoot, hubSkill.relativePath);
        if (!isWriteTargetAllowed(targetPath, readOnlyHubs)) continue;
        items.push({
          ...base,
          id: `pull:${name}:${spoke.instanceId}`,
          direction: 'pull',
          action: 'update',
          sourcePath: spoke.path,
          targetPath,
          sourceHash: spoke.hash,
          targetHash: hubSkill.hash,
          linkMode: 'copy',
          status: 'pending',
          selection,
        });
      }
    }
  }

  if (direction === 'pull') {
    for (const [name, spokes] of spokesByName) {
      if (hubByName.has(name)) continue;
      for (const spoke of spokes) {
        const targetPath = joinPath(hubRoot, name, 'SKILL.md');
        if (!isWriteTargetAllowed(targetPath, readOnlyHubs)) continue;
        items.push({
          id: `create:${name}:${spoke.instanceId}`,
          skillName: name,
          direction: 'pull',
          action: 'create',
          resourceType,
          sourcePath: spoke.path,
          targetPath,
          sourceHash: spoke.hash,
          linkMode: 'copy',
          agent: spoke.agent,
          status: 'pending',
        });
      }
    }
  }

  items.sort((a, b) => a.skillName.localeCompare(b.skillName) || a.targetPath.localeCompare(b.targetPath));

  const counts = emptyCounts();
  for (const item of items) countItem(counts, item);

  return { id, createdAt, hubRoot, direction, items, counts };
}

/** 预演摘要：只统计与列出目标路径，不写盘。 */
export interface SyncPreview {
  counts: SyncPlanCounts;
  lines: string[];
  empty: boolean;
}

export function previewSyncPlan(plan: SyncPlan): SyncPreview {
  const lines = plan.items.map((item) => {
    const flag = item.status === 'conflict' ? '[冲突] ' : item.status === 'skipped' ? '[跳过] ' : '';
    return `${flag}${item.direction.toUpperCase()} ${item.action} ${item.skillName} -> ${item.targetPath}（${item.linkMode}）`;
  });
  return {
    counts: plan.counts,
    lines,
    empty: plan.items.length === 0,
  };
}

const PLAN_KEYS = new Set([
  'id',
  'createdAt',
  'hubRoot',
  'direction',
  'items',
  'counts',
]);

const ITEM_KEYS = new Set([
  'id',
  'skillName',
  'direction',
  'action',
  'resourceType',
  'sourcePath',
  'targetPath',
  'sourceHash',
  'targetHash',
  'linkMode',
  'agent',
  'status',
  'selection',
]);

const ITEM_REQUIRED = [
  'id',
  'skillName',
  'direction',
  'action',
  'resourceType',
  'sourcePath',
  'targetPath',
  'sourceHash',
  'linkMode',
  'agent',
  'status',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 校验计划结构：拒绝缺失字段与未知字段，供跨端契约测试使用。 */
export function validateSyncPlan(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['计划必须是对象'];

  for (const key of Object.keys(value)) {
    if (!PLAN_KEYS.has(key)) errors.push(`未知字段：${key}`);
  }
  for (const key of ['id', 'createdAt', 'hubRoot', 'direction', 'items', 'counts']) {
    if (!(key in value)) errors.push(`缺少字段：${key}`);
  }

  const items = value['items'];
  if (!Array.isArray(items)) {
    errors.push('items 必须是数组');
    return errors;
  }

  items.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`items[${index}] 必须是对象`);
      return;
    }
    for (const key of Object.keys(item)) {
      if (!ITEM_KEYS.has(key)) errors.push(`items[${index}] 未知字段：${key}`);
    }
    for (const key of ITEM_REQUIRED) {
      if (!(key in item)) errors.push(`items[${index}] 缺少字段：${key}`);
    }
  });

  return errors;
}