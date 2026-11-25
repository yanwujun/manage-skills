import { describe, expect, it } from 'vitest';
import {
  assertSyncableResource,
  buildSyncPlan,
  loadPlan,
  previewSyncPlan,
  savePlan,
  sha256Hex,
  utf8Encode,
  validateSyncPlan,
  type AgentInstance,
  type SkillRecord,
} from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';

const contentOf = (name: string, body = '正文'): string =>
  `---\nname: ${name}\ndescription: ${name}\n---\n\n${body}\n`;

const hashOf = (name: string, body = '正文'): string => sha256Hex(utf8Encode(contentOf(name, body)));

function spoke(name: string, overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: `claude:${name}/SKILL.md`,
    instanceId: 'claude',
    agent: 'claude-code',
    root: '/home/dev/.claude/skills',
    path: `/home/dev/.claude/skills/${name}/SKILL.md`,
    relativePath: `${name}/SKILL.md`,
    hash: hashOf(name),
    size: contentOf(name).length,
    mtimeMs: 1000,
    frontmatter: { name },
    status: 'ok',
    ...overrides,
  };
}

const cursorTarget: AgentInstance = {
  id: 'cursor',
  agent: 'cursor',
  root: '/home/dev/.cursor/skills',
  scope: 'global',
  os: 'linux',
};

function hubFs(): ReturnType<typeof createMemoryFs> {
  return createMemoryFs({
    '/hub/alpha/SKILL.md': contentOf('alpha'),
    '/hub/beta/SKILL.md': contentOf('beta'),
    '/hub/delta/SKILL.md': contentOf('delta'),
  });
}

describe('计划结构校验', () => {
  it('合法计划无错误', async () => {
    const plan = await buildSyncPlan(hubFs().fs, '/hub', [], {
      targets: [cursorTarget],
      now: new Date('2026-11-25T00:00:00Z'),
    });
    expect(validateSyncPlan(plan)).toEqual([]);
  });

  it('缺少字段被拒绝', () => {
    const errors = validateSyncPlan({ id: 'x', hubRoot: '/hub' });
    expect(errors).toContain('缺少字段：items');
  });

  it('未知字段被拒绝', () => {
    const errors = validateSyncPlan({
      id: 'x',
      createdAt: '',
      hubRoot: '/hub',
      direction: 'push',
      items: [{ id: 'i', extra: true }],
      counts: {},
    });
    expect(errors.some((error) => error.includes('未知字段：extra'))).toBe(true);
  });
});

describe('计划生成', () => {
  it('hub 独有技能对目标实例生成 create', async () => {
    const plan = await buildSyncPlan(hubFs().fs, '/hub', [], {
      targets: [cursorTarget],
      now: new Date('2026-11-25T00:00:00Z'),
    });
    expect(plan.counts.create).toBe(3);
    const alpha = plan.items.find((item) => item.skillName === 'alpha');
    expect(alpha?.targetPath).toBe('/home/dev/.cursor/skills/alpha/SKILL.md');
    expect(alpha?.direction).toBe('push');
  });

  it('同名同内容不产生条目', async () => {
    const plan = await buildSyncPlan(hubFs().fs, '/hub', [spoke('alpha')]);
    expect(plan.items.some((item) => item.skillName === 'alpha')).toBe(false);
  });

  it('同名不同内容且未选边时标记 conflict', async () => {
    const plan = await buildSyncPlan(hubFs().fs, '/hub', [
      spoke('alpha', { hash: hashOf('alpha', '不同正文') }),
    ]);
    const item = plan.items.find((entry) => entry.skillName === 'alpha');
    expect(item?.status).toBe('conflict');
    expect(item?.targetHash).toBeDefined();
    expect(plan.counts.conflict).toBe(1);
  });

  it('选 hub 生成 push update，选 spoke 生成 pull update，选 skip 标记跳过', async () => {
    const records = [spoke('alpha', { hash: hashOf('alpha', '不同正文') })];

    const toHub = await buildSyncPlan(hubFs().fs, '/hub', records, { selections: { alpha: 'hub' } });
    expect(toHub.items[0]?.direction).toBe('push');
    expect(toHub.items[0]?.status).toBe('pending');

    const toSpoke = await buildSyncPlan(hubFs().fs, '/hub', records, { selections: { alpha: 'spoke' } });
    expect(toSpoke.items[0]?.direction).toBe('pull');
    expect(toSpoke.items[0]?.targetPath).toBe('/hub/alpha/SKILL.md');

    const skipped = await buildSyncPlan(hubFs().fs, '/hub', records, { selections: { alpha: 'skip' } });
    expect(skipped.items[0]?.status).toBe('skipped');
    expect(skipped.counts.skipped).toBe(1);
  });

  it('pull 方向回收 spoke 独有技能', async () => {
    const plan = await buildSyncPlan(hubFs().fs, '/hub', [spoke('gamma')], { direction: 'pull' });
    expect(plan.items[0]?.skillName).toBe('gamma');
    expect(plan.items[0]?.targetPath).toBe('/hub/gamma/SKILL.md');
  });

  it('按 agent 覆盖链接方式', async () => {
    const plan = await buildSyncPlan(hubFs().fs, '/hub', [spoke('alpha', { hash: hashOf('alpha', 'x') })], {
      selections: { alpha: 'hub' },
      linkModeByAgent: { 'claude-code': 'symlink' },
    });
    expect(plan.items[0]?.linkMode).toBe('symlink');
    expect(plan.counts.link).toBe(1);
  });

  it('目标位于只读 hub 之下时不生成条目', async () => {
    const plan = await buildSyncPlan(hubFs().fs, '/hub', [spoke('alpha', { hash: hashOf('alpha', 'x') })], {
      selections: { alpha: 'spoke' },
      readOnlyHubs: ['/hub'],
    });
    expect(plan.items).toEqual([]);
  });
});

describe('预演', () => {
  it('输出计数与目标路径', async () => {
    const plan = await buildSyncPlan(hubFs().fs, '/hub', [], { targets: [cursorTarget] });
    const preview = previewSyncPlan(plan);
    expect(preview.empty).toBe(false);
    expect(preview.counts.create).toBe(3);
    expect(preview.lines[0]).toContain('/home/dev/.cursor/skills/');
  });

  it('空计划标记 empty', async () => {
    const plan = await buildSyncPlan(hubFs().fs, '/hub', []);
    expect(previewSyncPlan(plan).empty).toBe(true);
  });
});

describe('计划快照', () => {
  it('保存后可完整读回', async () => {
    const memory = createMemoryFs();
    const plan = await buildSyncPlan(hubFs().fs, '/hub', [], { targets: [cursorTarget] });
    const path = '/home/dev/.manage-skills/plans/plan-1.json';

    await savePlan(memory.fs, path, plan);
    const loaded = await loadPlan(memory.fs, path);
    expect(loaded.error).toBeUndefined();
    expect(loaded.plan).toEqual(plan);
  });

  it('版本不支持时报错', async () => {
    const memory = createMemoryFs({
      '/plans/x.json': JSON.stringify({ schemaVersion: 99, plan: {} }),
    });
    const loaded = await loadPlan(memory.fs, '/plans/x.json');
    expect(loaded.plan).toBeNull();
    expect(loaded.error).toContain('不支持的计划版本');
  });
});

describe('资源类型约束', () => {
  it('拒绝非 skill/command 类型', () => {
    expect(() => assertSyncableResource('mcp')).toThrow('不支持同步的资源类型');
    expect(() => assertSyncableResource('hook')).toThrow();
    expect(() => assertSyncableResource('skill')).not.toThrow();
  });

  it('buildSyncPlan 传非同步类型时抛错', async () => {
    await expect(
      buildSyncPlan(hubFs().fs, '/hub', [], { resourceType: 'memory' as never }),
    ).rejects.toThrow('不支持同步的资源类型');
  });
});