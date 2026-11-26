import type { SkillRecord, SyncPlan, SyncPlanItem } from '@manage-skills/core';
import { buildConflicts } from '../conflicts/conflicts';

export type SyncAction = 'create' | 'update' | 'skip';
export type SyncLinkMode = 'copy' | 'symlink';

export interface SyncQueueItem {
  id: string;
  skillName: string;
  direction: string;
  action: SyncAction;
  linkMode: SyncLinkMode;
  sourceInstance: string;
  sourcePath: string;
  sourceHash: string;
  targetPath: string;
  targetHash?: string;
  targetInstance: string;
  targetAgent: SkillRecord['agent'];
}

/** 把冲突选边转换为同步队列：选中的版本作为来源，其余实例作为目标。 */
export function buildSyncQueue(
  skills: SkillRecord[],
  selections: Record<string, string>,
): SyncQueueItem[] {
  const groups = buildConflicts(skills);
  const items: SyncQueueItem[] = [];

  for (const group of groups) {
    const selected = selections[group.name];
    if (!selected || selected === 'skip') continue;
    const source = group.sides.find((side) => side.path === selected);
    if (!source) continue;

    for (const side of group.sides) {
      if (side.path === selected) continue;
      items.push({
        id: `${group.name}:${side.path}`,
        skillName: group.name,
        direction: `${source.instanceId} → ${side.instanceId}`,
        action: 'update',
        linkMode: 'copy',
        sourceInstance: source.instanceId,
        sourcePath: source.path,
        sourceHash: source.hash,
        targetPath: side.path,
        targetHash: side.hash,
        targetInstance: side.instanceId,
        targetAgent: side.agent,
      });
    }
  }

  return items.sort((a, b) => a.skillName.localeCompare(b.skillName));
}

export function summarizeQueue(items: SyncQueueItem[]): {
  create: number;
  update: number;
  skip: number;
} {
  let create = 0;
  let update = 0;
  let skip = 0;
  for (const item of items) {
    if (item.action === 'create') create += 1;
    else if (item.action === 'update') update += 1;
    else skip += 1;
  }
  return { create, update, skip };
}

/** 转为与 sync-engine 共享的 SyncPlan 结构（供契约测试与恢复链路使用）。 */
export function toSyncPlan(
  items: SyncQueueItem[],
  hubRoot = '',
  planId = `desktop-${Date.now()}`,
): SyncPlan {
  const planItems: SyncPlanItem[] = items.map((item) => ({
    id: item.id,
    skillName: item.skillName,
    direction: 'push',
    action: item.action === 'create' ? 'create' : 'update',
    resourceType: 'skill',
    sourcePath: item.sourcePath,
    targetPath: item.targetPath,
    sourceHash: item.sourceHash,
    targetHash: item.targetHash,
    linkMode: item.linkMode,
    agent: item.targetAgent,
    status: item.action === 'skip' ? 'skipped' : 'pending',
  }));
  const counts = summarizeQueue(items);
  return {
    id: planId,
    createdAt: new Date().toISOString(),
    hubRoot,
    direction: 'push',
    items: planItems,
    counts: {
      create: counts.create,
      update: counts.update,
      link: planItems.filter((item) => item.linkMode === 'symlink').length,
      skipped: counts.skip,
      conflict: 0,
      total: planItems.length,
    },
  };
}
