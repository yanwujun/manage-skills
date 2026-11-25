import { describe, expect, it } from 'vitest';
import {
  scanInstance,
  scanInstances,
  sha256Hex,
  utf8Encode,
  type AgentInstance,
} from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';

const CLAUDE: AgentInstance = {
  id: 'claude',
  agent: 'claude-code',
  root: '/home/dev/.claude/skills',
  scope: 'global',
  os: 'linux',
};

const CURSOR: AgentInstance = {
  id: 'cursor',
  agent: 'cursor',
  root: '/home/dev/.cursor/skills',
  scope: 'global',
  os: 'linux',
};

const PDF = '---\nname: pdf-toolkit\ndescription: PDF 工具\n---\n\n# PDF\n';
const BROKEN = '# 没有 frontmatter\n';
const REVIEW = '---\nname: code-review\ndescription: 审查\n---\n';

describe('scanInstances', () => {
  it('扫描多个实例并按路径排序', async () => {
    const memory = createMemoryFs({
      '/home/dev/.claude/skills/pdf-toolkit/SKILL.md': PDF,
      '/home/dev/.claude/skills/broken/SKILL.md': BROKEN,
      '/home/dev/.cursor/skills/code-review/SKILL.md': REVIEW,
      '/home/dev/.claude/skills/readme.md': 'not a skill',
    });

    const records = await scanInstances(memory.fs, [CLAUDE, CURSOR]);

    expect(records).toHaveLength(3);
    expect(records.map((item) => item.frontmatter.name)).toEqual([
      'broken',
      'pdf-toolkit',
      'code-review',
    ]);
    expect(records.find((item) => item.frontmatter.name === 'broken')?.status).toBe('invalid');
    expect(records.find((item) => item.frontmatter.name === 'pdf-toolkit')?.status).toBe('ok');
  });

  it('记录 hash、大小与相对路径', async () => {
    const memory = createMemoryFs({ '/home/dev/.claude/skills/pdf-toolkit/SKILL.md': PDF });
    const [record] = await scanInstance(memory.fs, CLAUDE);
    expect(record?.hash).toBe(sha256Hex(utf8Encode(PDF)));
    expect(record?.relativePath).toBe('pdf-toolkit/SKILL.md');
    expect(record?.size).toBe(utf8Encode(PDF).length);
    expect(record?.agent).toBe('claude-code');
  });

  it('缺少 name 时用目录名补齐', async () => {
    const memory = createMemoryFs({
      '/home/dev/.claude/skills/no-name/SKILL.md': '---\ndescription: 无名\n---\n',
    });
    const [record] = await scanInstance(memory.fs, CLAUDE);
    expect(record?.frontmatter.name).toBe('no-name');
  });

  it('Hermes category 层级的技能可被扫描', async () => {
    const hermes: AgentInstance = {
      id: 'hermes',
      agent: 'hermes',
      root: '/home/dev/.hermes/skills',
      scope: 'global',
      os: 'linux',
    };
    const memory = createMemoryFs({ '/home/dev/.hermes/skills/tools/web-scraper/SKILL.md': REVIEW });
    const [record] = await scanInstance(memory.fs, hermes);
    expect(record?.relativePath).toBe('tools/web-scraper/SKILL.md');
  });

  it('超过 maxDepth 的目录不再深入', async () => {
    const memory = createMemoryFs({
      '/home/dev/.claude/skills/a/b/c/d/e/SKILL.md': REVIEW,
    });
    const shallow = await scanInstance(memory.fs, CLAUDE, { maxDepth: 3 });
    const deep = await scanInstance(memory.fs, CLAUDE, { maxDepth: 6 });
    expect(shallow).toHaveLength(0);
    expect(deep).toHaveLength(1);
  });

  it('读取失败的文件记录为 invalid 而不是崩溃', async () => {
    const memory = createMemoryFs({ '/home/dev/.claude/skills/x/SKILL.md': REVIEW });
    const failing = {
      ...memory.fs,
      readFile: async () => {
        throw new Error('EACCES');
      },
    };
    const [record] = await scanInstance(failing, CLAUDE);
    expect(record?.status).toBe('invalid');
    expect(record?.error).toContain('读取失败');
  });
});