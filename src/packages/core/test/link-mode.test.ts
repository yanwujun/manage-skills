import { describe, expect, it } from 'vitest';
import {
  buildSyncPlan,
  createLink,
  executeSyncPlan,
  probeSymlinkSupport,
  scanInstances,
  sha256Hex,
  switchLinkMode,
  utf8Encode,
  type AgentInstance,
  type FileSystem,
  type SkillRecord,
} from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';

const HUB = '/hub/alpha/SKILL.md';
const CLAUDE = '/home/dev/.claude/skills/alpha/SKILL.md';
const CURSOR = '/home/dev/.cursor/skills/alpha/SKILL.md';

const content = (body: string): string => `---\nname: alpha\ndescription: alpha\n---\n\n${body}\n`;
const hash = (body: string): string => sha256Hex(utf8Encode(content(body)));

function record(agent: 'claude-code' | 'cursor', root: string, path: string, body: string): SkillRecord {
  return {
    id: `${agent}:alpha/SKILL.md`,
    instanceId: agent,
    agent,
    root,
    path,
    relativePath: 'alpha/SKILL.md',
    hash: hash(body),
    size: content(body).length,
    mtimeMs: 1000,
    frontmatter: { name: 'alpha' },
    status: 'ok',
  };
}

describe('copy 落地', () => {
  it('写入独立副本，修改源文件不影响副本', async () => {
    const memory = createMemoryFs({ [HUB]: content('旧') });
    await createLink(memory.fs, HUB, '/home/dev/.claude/skills/alpha/SKILL.md', 'copy');

    expect(memory.files.get(CLAUDE)).toBe(content('旧'));
    memory.files.set(HUB, content('新'));
    expect(memory.files.get(CLAUDE)).toBe(content('旧'));
  });
});

describe('symlink 权限探测', () => {
  it('支持符号链接时探测通过', async () => {
    const memory = createMemoryFs();
    const probe = await probeSymlinkSupport(memory.fs, '/home/dev/.claude/skills');
    expect(probe.supported).toBe(true);
  });

  it('文件系统不支持时明确拒绝，不降级', async () => {
    const memory = createMemoryFs({ [HUB]: content('旧') });
    const noLinkFs: FileSystem = { ...memory.fs, symlink: undefined, readlink: undefined };

    const probe = await probeSymlinkSupport(noLinkFs, '/home/dev/.claude/skills');
    expect(probe.supported).toBe(false);

    await expect(
      createLink(noLinkFs, HUB, '/home/dev/.claude/skills/alpha/SKILL.md', 'symlink'),
    ).rejects.toThrow('不支持符号链接');
    expect(memory.files.has(CLAUDE)).toBe(false);
  });
});

describe('按 Agent 覆盖链接方式', () => {
  it('Cursor 建链接、其余写副本', async () => {
    const memory = createMemoryFs({
      [HUB]: content('新'),
      [CLAUDE]: content('旧'),
      [CURSOR]: content('旧'),
    });
    const records = [
      record('claude-code', '/home/dev/.claude/skills', CLAUDE, '旧'),
      record('cursor', '/home/dev/.cursor/skills', CURSOR, '旧'),
    ];
    const plan = await buildSyncPlan(memory.fs, '/hub', records, {
      selections: { alpha: 'hub' },
      linkModeByAgent: { cursor: 'symlink' },
    });
    const report = await executeSyncPlan(memory.fs, plan, {
      backupRoot: '/home/dev/.manage-skills/backups',
      timestamp: 'mixed',
    });

    expect(report.counts.updated).toBe(2);
    expect(memory.files.get(CLAUDE)).toContain('新');
    expect(memory.links.get(CURSOR)).toBe(HUB);
    expect(memory.files.has(CURSOR)).toBe(false);
  });
});

describe('模式切换', () => {
  it('copy 转 symlink：备份副本并只保留链接', async () => {
    const memory = createMemoryFs({ [HUB]: content('正文'), [CLAUDE]: content('正文') });
    const result = await switchLinkMode(memory.fs, HUB, CLAUDE, 'symlink', {
      backupDir: '/backups/switch',
    });

    expect(result.previous).toBe('copy');
    expect(result.backupPath).toBeDefined();
    expect(memory.files.has(CLAUDE)).toBe(false);
    expect(memory.links.get(CLAUDE)).toBe(HUB);
    expect(memory.files.get(result.backupPath ?? '')).toContain('正文');
  });

  it('已是目标形态时不做写入', async () => {
    const memory = createMemoryFs({ [HUB]: content('正文') }, { [CLAUDE]: HUB });
    const result = await switchLinkMode(memory.fs, HUB, CLAUDE, 'symlink', {
      backupDir: '/backups/switch',
    });
    expect(result.previous).toBe('symlink');
    expect(result.backupPath).toBeUndefined();
    expect(memory.writes).toEqual([]);
  });
});

describe('失效链接检测', () => {
  const instance: AgentInstance = {
    id: 'claude',
    agent: 'claude-code',
    root: '/home/dev/.claude/skills',
    scope: 'global',
    os: 'linux',
  };

  it('指向不存在目标的链接被标记失效', async () => {
    const memory = createMemoryFs({}, { [CLAUDE]: '/missing/SKILL.md' });
    const records = await scanInstances(memory.fs, [instance]);
    expect(records).toHaveLength(1);
    expect(records[0]?.linkBroken).toBe(true);
    expect(records[0]?.status).toBe('invalid');
  });

  it('源文件恢复后状态回到正常', async () => {
    const memory = createMemoryFs({ [HUB]: content('正文') }, { [CLAUDE]: HUB });
    const records = await scanInstances(memory.fs, [instance]);
    expect(records[0]?.link).toBe('symlink');
    expect(records[0]?.linkBroken).toBeUndefined();
    expect(records[0]?.status).toBe('ok');
  });
});