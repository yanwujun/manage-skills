import { describe, expect, it } from 'vitest';
import type { SkillRecord } from '@manage-skills/core';
import { buildSyncQueue } from '../src/features/sync/queue';

function record(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'claude:foo/SKILL.md',
    instanceId: 'claude',
    agent: 'claude-code',
    root: 'C:\\skills',
    path: 'C:\\skills\\foo\\SKILL.md',
    relativePath: 'foo/SKILL.md',
    hash: 'h1',
    size: 10,
    mtimeMs: 1000,
    frontmatter: { name: 'foo' },
    status: 'ok',
    ...overrides,
  };
}

describe('buildSyncQueue', () => {
  it('选边后以选中版本为来源、其余实例为目标', () => {
    const skills = [
      record({ path: 'C:\\a\\foo\\SKILL.md', instanceId: 'a', hash: 'h1' }),
      record({ path: 'C:\\b\\foo\\SKILL.md', instanceId: 'b', hash: 'h2' }),
    ];
    const queue = buildSyncQueue(skills, { foo: 'C:\\a\\foo\\SKILL.md' });

    expect(queue).toHaveLength(1);
    expect(queue[0]?.sourcePath).toBe('C:\\a\\foo\\SKILL.md');
    expect(queue[0]?.targetPath).toBe('C:\\b\\foo\\SKILL.md');
  });

  it('三实例生成两条同步项', () => {
    const skills = [
      record({ path: 'C:\\a\\foo\\SKILL.md', instanceId: 'a', hash: 'h1' }),
      record({ path: 'C:\\b\\foo\\SKILL.md', instanceId: 'b', hash: 'h2' }),
      record({ path: 'C:\\c\\foo\\SKILL.md', instanceId: 'c', hash: 'h3' }),
    ];
    const queue = buildSyncQueue(skills, { foo: 'C:\\b\\foo\\SKILL.md' });
    expect(queue.map((item) => item.targetPath).sort()).toEqual([
      'C:\\a\\foo\\SKILL.md',
      'C:\\c\\foo\\SKILL.md',
    ]);
  });

  it('标记跳过不进入队列', () => {
    const skills = [
      record({ path: 'C:\\a\\foo\\SKILL.md', hash: 'h1' }),
      record({ path: 'C:\\b\\foo\\SKILL.md', hash: 'h2' }),
    ];
    expect(buildSyncQueue(skills, { foo: 'skip' })).toHaveLength(0);
  });

  it('未选边不进入队列', () => {
    const skills = [
      record({ path: 'C:\\a\\foo\\SKILL.md', hash: 'h1' }),
      record({ path: 'C:\\b\\foo\\SKILL.md', hash: 'h2' }),
    ];
    expect(buildSyncQueue(skills, {})).toHaveLength(0);
  });
});