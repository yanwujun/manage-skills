import { describe, expect, it } from 'vitest';
import type { SkillRecord, SyncPlan } from '@manage-skills/core';
import { buildSyncQueue, toSyncPlan } from '../src/features/sync/queue';

function record(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'claude:foo/SKILL.md',
    instanceId: 'claude',
    agent: 'claude-code',
    root: '/skills',
    path: '/skills/foo/SKILL.md',
    relativePath: 'foo/SKILL.md',
    hash: 'h1',
    size: 10,
    mtimeMs: 1000,
    frontmatter: { name: 'foo' },
    status: 'ok',
    ...overrides,
  };
}

describe('desktop <-> sync-engine plan contract', () => {
  it('produces a SyncPlan JSON object matching @manage-skills/core SyncPlan schema', () => {
    const skills = [
      record({ path: '/a/foo/SKILL.md', instanceId: 'a', agent: 'claude-code', hash: 'h1' }),
      record({ path: '/b/foo/SKILL.md', instanceId: 'b', agent: 'cursor', hash: 'h2' }),
    ];
    const queue = buildSyncQueue(skills, { foo: '/a/foo/SKILL.md' });
    const plan: SyncPlan = toSyncPlan(queue, '/hub', 'contract-plan-1');

    // 验证 SyncPlan 顶层字段契约
    expect(plan).toMatchObject({
      id: 'contract-plan-1',
      hubRoot: '/hub',
      direction: 'push',
      counts: {
        create: 0,
        update: 1,
        link: 0,
        skipped: 0,
        conflict: 0,
        total: 1,
      },
    });
    expect(typeof plan.createdAt).toBe('string');

    // 验证 SyncPlanItem 字段契约
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({
      id: 'foo:/b/foo/SKILL.md',
      skillName: 'foo',
      direction: 'push',
      action: 'update',
      resourceType: 'skill',
      sourcePath: '/a/foo/SKILL.md',
      targetPath: '/b/foo/SKILL.md',
      sourceHash: 'h1',
      targetHash: 'h2',
      linkMode: 'copy',
      agent: 'cursor',
      status: 'pending',
    });
  });
});
