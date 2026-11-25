import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { scanInstances, type AgentInstance } from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';
import { createNodeFs } from './helpers/node-fs.js';

const CLAUDE: AgentInstance = {
  id: 'claude',
  agent: 'claude-code',
  root: '/home/dev/.claude/skills',
  scope: 'global',
  os: 'linux',
};

const CONTENT = '---\nname: pdf-toolkit\ndescription: PDF\n---\n\n# body\n';

describe('只读守护', () => {
  it('内存文件系统上扫描不触发任何写入', async () => {
    const memory = createMemoryFs({
      '/home/dev/.claude/skills/pdf-toolkit/SKILL.md': CONTENT,
    });
    await scanInstances(memory.fs, [CLAUDE]);
    expect(memory.writes).toEqual([]);
    expect(memory.files.get('/home/dev/.claude/skills/pdf-toolkit/SKILL.md')).toBe(CONTENT);
  });

  const created: string[] = [];
  afterEach(async () => {
    for (const dir of created.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('真实文件系统上扫描不改变内容与 mtime', async () => {
    const root = await mkdtemp(join(tmpdir(), 'manage-skills-readonly-'));
    created.push(root);
    const skillDir = join(root, 'pdf-toolkit');
    await fsp.mkdir(skillDir, { recursive: true });
    const file = join(skillDir, 'SKILL.md');
    await fsp.writeFile(file, CONTENT, 'utf8');

    const before = await fsp.stat(file);
    const instance: AgentInstance = { ...CLAUDE, root };
    const records = await scanInstances(createNodeFs(), [instance]);
    const after = await fsp.stat(file);

    expect(records).toHaveLength(1);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(await fsp.readFile(file, 'utf8')).toBe(CONTENT);
  });
});