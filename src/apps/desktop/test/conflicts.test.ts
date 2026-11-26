import { describe, expect, it } from 'vitest';
import type { SkillRecord } from '@manage-skills/core';
import { buildConflicts } from '../src/features/conflicts/conflicts';

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

describe('buildConflicts', () => {
  it('同名不同内容归为冲突组', () => {
    const groups = buildConflicts([
      record({ path: 'C:\\a\\foo\\SKILL.md', instanceId: 'a', hash: 'h1' }),
      record({ path: 'C:\\b\\foo\\SKILL.md', instanceId: 'b', hash: 'h2' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.sides).toHaveLength(2);
  });

  it('同名同内容不算冲突', () => {
    const groups = buildConflicts([
      record({ path: 'C:\\a\\foo\\SKILL.md', hash: 'same' }),
      record({ path: 'C:\\b\\foo\\SKILL.md', hash: 'same' }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('三个以上实例全部列出', () => {
    const groups = buildConflicts([
      record({ path: 'C:\\a\\foo\\SKILL.md', instanceId: 'a', hash: 'h1' }),
      record({ path: 'C:\\b\\foo\\SKILL.md', instanceId: 'b', hash: 'h2' }),
      record({ path: 'C:\\c\\foo\\SKILL.md', instanceId: 'c', hash: 'h3' }),
    ]);
    expect(groups[0]?.sides.map((side) => side.instanceId)).toEqual(['a', 'b', 'c']);
  });

  it('stale 条目被排除', () => {
    const groups = buildConflicts([
      record({ path: 'C:\\a\\foo\\SKILL.md', hash: 'h1' }),
      record({ path: 'C:\\b\\foo\\SKILL.md', hash: 'h2', stale: true }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('不同名不产生冲突', () => {
    const groups = buildConflicts([
      record({ path: 'C:\\a\\foo\\SKILL.md', frontmatter: { name: 'foo' }, hash: 'h1' }),
      record({ path: 'C:\\b\\bar\\SKILL.md', frontmatter: { name: 'bar' }, hash: 'h2' }),
    ]);
    expect(groups).toHaveLength(0);
  });
});