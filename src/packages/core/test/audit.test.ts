import { describe, expect, it } from 'vitest';
import {
  buildAuditReport,
  renderAuditMarkdown,
  scanInstances,
  type AgentInstance,
  type HistoryEntry,
  type SimilarityGroup,
  type SkillRecord,
} from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';

function record(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'claude:foo/SKILL.md',
    instanceId: 'claude',
    agent: 'claude-code',
    root: '/home/dev/.claude/skills',
    path: '/home/dev/.claude/skills/foo/SKILL.md',
    relativePath: 'foo/SKILL.md',
    hash: 'h1',
    size: 10,
    mtimeMs: 1000,
    frontmatter: { name: 'foo' },
    status: 'ok',
    ...overrides,
  };
}

const encoder = (text: string): (() => Promise<string>) => async () => text;

describe('drift 检测', () => {
  it('同名不同内容产出 drift 并带差异统计', async () => {
    const records = [
      record({ path: '/a/foo/SKILL.md', hash: 'h1' }),
      record({ path: '/b/foo/SKILL.md', hash: 'h2', instanceId: 'cursor', agent: 'cursor' }),
    ];
    const report = await buildAuditReport(records, {
      readText: async (path) => (path.startsWith('/a') ? 'line1\nline2' : 'line1\nline2 changed'),
    });

    expect(report.counts.drift).toBe(1);
    const finding = report.findings.find((item) => item.kind === 'drift');
    expect(finding?.sides).toHaveLength(2);
    expect(finding?.evidence.diffStats).toEqual({ added: 0, removed: 0, changed: 1 });
    expect(finding?.diffLines).toBeUndefined();
  });

  it('同名同内容不产出一致性问题', async () => {
    const records = [
      record({ path: '/a/foo/SKILL.md', hash: 'same' }),
      record({ path: '/b/foo/SKILL.md', hash: 'same' }),
    ];
    const report = await buildAuditReport(records);
    expect(report.counts.drift).toBe(0);
  });

  it('读取失败时仍产出 drift，只是没有差异统计', async () => {
    const records = [
      record({ path: '/a/foo/SKILL.md', hash: 'h1' }),
      record({ path: '/b/foo/SKILL.md', hash: 'h2' }),
    ];
    const report = await buildAuditReport(records, {
      readText: async () => {
        throw new Error('EACCES');
      },
    });
    const finding = report.findings.find((item) => item.kind === 'drift');
    expect(finding).toBeDefined();
    expect(finding?.evidence.diffStats).toBeUndefined();
  });
});

describe('dup 检测', () => {
  it('不同名同内容产出 dup', async () => {
    const records = [
      record({ path: '/a/SKILL.md', relativePath: 'a/SKILL.md', frontmatter: { name: 'alpha' }, hash: 'same' }),
      record({ path: '/b/SKILL.md', relativePath: 'b/SKILL.md', frontmatter: { name: 'beta' }, hash: 'same' }),
    ];
    const report = await buildAuditReport(records);
    expect(report.counts.dup).toBe(1);
  });

  it('同名同内容不算 dup（归 drift 之外的重复副本）', async () => {
    const records = [
      record({ path: '/a/SKILL.md', hash: 'same' }),
      record({ path: '/b/SKILL.md', hash: 'same' }),
    ];
    const report = await buildAuditReport(records);
    expect(report.counts.dup).toBe(0);
  });
});

describe('invalid 检测', () => {
  it('解析失败的技能产出 invalid', async () => {
    const report = await buildAuditReport([
      record({ status: 'invalid', error: 'frontmatter 缺失' }),
    ]);
    expect(report.counts.invalid).toBe(1);
    expect(report.findings[0]?.evidence.reason).toBe('frontmatter 缺失');
  });

  it('Hermes description 超过 60 字符产出 invalid', async () => {
    const report = await buildAuditReport([
      record({
        agent: 'hermes',
        frontmatter: { name: 'hermes-skill', description: 'x'.repeat(61) },
      }),
    ]);
    expect(report.counts.invalid).toBe(1);
    expect(report.findings[0]?.message).toContain('61 字符');
  });

  it('Hermes description 未超限不报', async () => {
    const report = await buildAuditReport([
      record({
        agent: 'hermes',
        frontmatter: { name: 'hermes-skill', description: '短描述' },
      }),
    ]);
    expect(report.counts.invalid).toBe(0);
  });
});

describe('name-path-conflict 检测', () => {
  it('同 agent 同相对路径同名产出冲突', async () => {
    const records = [
      record({ root: '/home/dev/.claude/skills', path: '/home/dev/.claude/skills/foo/SKILL.md' }),
      record({ root: '/repo/.claude/skills', path: '/repo/.claude/skills/foo/SKILL.md' }),
    ];
    const report = await buildAuditReport(records, {});
    expect(report.counts['name-path-conflict']).toBe(1);
  });

  it('不同 agent 的同路径不算冲突', async () => {
    const records = [
      record({ agent: 'claude-code' }),
      record({ agent: 'cursor', instanceId: 'cursor' }),
    ];
    const report = await buildAuditReport(records);
    expect(report.counts['name-path-conflict']).toBe(0);
  });
});

describe('报告渲染与脱敏', () => {
  it('默认报告不含技能正文', async () => {
    const secret = 'SECRET_TOKEN_XYZ_123';
    const records = [
      record({ path: '/a/foo/SKILL.md', hash: 'h1' }),
      record({ path: '/b/foo/SKILL.md', hash: 'h2' }),
    ];
    const report = await buildAuditReport(records, {
      readText: encoder(`正文包含 ${secret}`),
    });
    const markdown = renderAuditMarkdown(report);
    expect(markdown).not.toContain(secret);
    expect(markdown).toContain('差异统计');
  });

  it('full 模式附带差异行', async () => {
    const secret = 'SECRET_TOKEN_XYZ_123';
    const records = [
      record({ path: '/a/foo/SKILL.md', hash: 'h1' }),
      record({ path: '/b/foo/SKILL.md', hash: 'h2' }),
    ];
    const report = await buildAuditReport(records, {
      full: true,
      readText: async (path) => (path.startsWith('/a') ? 'old' : `new ${secret}`),
    });
    const markdown = renderAuditMarkdown(report);
    expect(markdown).toContain(secret);
  });

  it('端到端产出四类条目并给出同步引导', async () => {
    const records = [
      record({ path: '/a/foo/SKILL.md', hash: 'h1' }),
      record({ path: '/b/foo/SKILL.md', hash: 'h2', instanceId: 'cursor', agent: 'cursor' }),
      record({ path: '/c/SKILL.md', relativePath: 'c/SKILL.md', frontmatter: { name: 'alpha' }, hash: 'same' }),
      record({ path: '/d/SKILL.md', relativePath: 'd/SKILL.md', frontmatter: { name: 'beta' }, hash: 'same' }),
      record({ path: '/e/SKILL.md', relativePath: 'e/SKILL.md', status: 'invalid', error: 'frontmatter 缺失' }),
      record({ path: '/repo/.claude/skills/foo/SKILL.md', root: '/repo/.claude/skills' }),
    ];
    const report = await buildAuditReport(records, { readText: encoder('same body') });
    expect(report.counts.drift).toBeGreaterThan(0);
    expect(report.counts.dup).toBeGreaterThan(0);
    expect(report.counts.invalid).toBeGreaterThan(0);
    expect(report.counts['name-path-conflict']).toBeGreaterThan(0);
    expect(report.syncHint).toContain('可同步项');
  });
});

describe('similar 集成', () => {
  it('高置信相似组进入报告且默认脱敏', async () => {
    const secret = 'SECRET_BODY_TOKEN';
    const records = [
      record({ path: '/a/SKILL.md', relativePath: 'a/SKILL.md', frontmatter: { name: 'alpha' } }),
      record({ path: '/b/SKILL.md', relativePath: 'b/SKILL.md', frontmatter: { name: 'beta' } }),
    ];
    const groups: SimilarityGroup[] = [
      {
        id: 'group:1',
        members: ['/a/SKILL.md', '/b/SKILL.md'],
        score: 0.92,
        chained: false,
        pairs: [
          {
            a: '/a/SKILL.md',
            b: '/b/SKILL.md',
            score: 0.92,
            descriptionScore: 0.9,
            bodyScore: 0.93,
          },
        ],
      },
    ];

    const report = await buildAuditReport(records, { similarityGroups: groups });
    expect(report.counts.similar).toBe(1);

    const markdown = renderAuditMarkdown(report);
    expect(markdown).toContain('相似度：92%');
    expect(markdown).not.toContain(secret);
  });

  it('链式相似组在报告中标注', async () => {
    const records = [
      record({ path: '/a/SKILL.md', relativePath: 'a/SKILL.md', frontmatter: { name: 'alpha' } }),
      record({ path: '/b/SKILL.md', relativePath: 'b/SKILL.md', frontmatter: { name: 'beta' } }),
    ];
    const groups: SimilarityGroup[] = [
      {
        id: 'group:2',
        members: ['/a/SKILL.md', '/b/SKILL.md'],
        score: 0.85,
        chained: true,
        pairs: [],
      },
    ];
    const report = await buildAuditReport(records, { similarityGroups: groups });
    expect(renderAuditMarkdown(report)).toContain('组内非全互连');
  });
});

describe('version-drift 检测', () => {
  const historyEntry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
    path: '/home/dev/.claude/skills/foo/SKILL.md',
    instanceId: 'claude',
    agent: 'claude-code',
    name: 'foo',
    hash: 'old-hash',
    size: 10,
    mtimeMs: 1000,
    version: '1.0.0',
    cause: 'scan',
    recordedAt: '2026-11-25T00:00:00.000Z',
    ...overrides,
  });

  it('内容变且版本未变产出 version-drift', async () => {
    const report = await buildAuditReport(
      [record({ hash: 'new-hash', frontmatter: { name: 'foo', version: '1.0.0' } })],
      { history: [historyEntry(), historyEntry({ hash: 'new-hash' })] },
    );

    expect(report.counts['version-drift']).toBe(1);
    const finding = report.findings.find((item) => item.kind === 'version-drift');
    expect(finding?.evidence).toMatchObject({
      hash: 'new-hash',
      previousHash: 'old-hash',
      version: '1.0.0',
      previousVersion: '1.0.0',
    });
  });

  it('内容与版本同时变化不产出', async () => {
    const report = await buildAuditReport(
      [record({ hash: 'new-hash', frontmatter: { name: 'foo', version: '1.0.1' } })],
      {
        history: [
          historyEntry(),
          historyEntry({ hash: 'new-hash', version: '1.0.1' }),
        ],
      },
    );
    expect(report.counts['version-drift']).toBe(0);
  });

  it('版本号缺失时提示补充', async () => {
    const report = await buildAuditReport(
      [record({ hash: 'new-hash', frontmatter: { name: 'foo' } })],
      {
        history: [
          historyEntry({ version: undefined }),
          historyEntry({ hash: 'new-hash', version: undefined }),
        ],
      },
    );
    const finding = report.findings.find((item) => item.kind === 'version-drift');
    expect(finding?.message).toContain('缺少 version 字段');
  });

  it('无历史基线不产出', async () => {
    const report = await buildAuditReport([record({ hash: 'new-hash' })], { history: [] });
    expect(report.counts['version-drift']).toBe(0);
  });

  it('报告渲染包含 version-drift 行且不含正文', async () => {
    const report = await buildAuditReport(
      [record({ hash: 'new-hash', frontmatter: { name: 'foo', version: '1.0.0' } })],
      { history: [historyEntry(), historyEntry({ hash: 'new-hash' })] },
    );
    const markdown = renderAuditMarkdown(report);
    expect(markdown).toContain('| version-drift | 1 |');
    expect(markdown).toContain('内容已变但版本未升');
    expect(markdown).not.toContain('body');
    expect(JSON.stringify(report)).not.toContain('body');
  });
});

describe('审计只读守护', () => {
  it('扫描 + 审计不产生任何写入', async () => {
    const content = '---\nname: foo\n---\nbody';
    const memory = createMemoryFs({
      '/home/dev/.claude/skills/foo/SKILL.md': content,
    });
    const instance: AgentInstance = {
      id: 'claude',
      agent: 'claude-code',
      root: '/home/dev/.claude/skills',
      scope: 'global',
      os: 'linux',
    };
    const records = await scanInstances(memory.fs, [instance]);
    await buildAuditReport(records, { readText: (path) => memory.fs.readTextFile(path) });

    expect(memory.writes).toEqual([]);
    expect(memory.files.get('/home/dev/.claude/skills/foo/SKILL.md')).toBe(content);
  });
});