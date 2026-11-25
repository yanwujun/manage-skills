import { describe, expect, it } from 'vitest';
import {
  buildHubDiff,
  renderHubDiffJson,
  renderHubDiffMarkdown,
  resolveHub,
  scanHub,
  sha256Hex,
  utf8Encode,
  type SkillRecord,
} from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';

const contentOf = (name: string): string =>
  `---\nname: ${name}\ndescription: ${name} 技能\n---\n\n正文 ${name}\n`;

const hashOf = (name: string): string => sha256Hex(utf8Encode(contentOf(name)));

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
    frontmatter: { name, description: `${name} 技能` },
    status: 'ok',
    ...overrides,
  };
}

describe('scanHub', () => {
  it('识别根级布局', async () => {
    const memory = createMemoryFs({
      '/hub/alpha/SKILL.md': contentOf('alpha'),
      '/hub/beta/SKILL.md': contentOf('beta'),
    });
    const result = await scanHub(memory.fs, '/hub');
    expect(result.layout).toBe('root');
    expect(result.skills.map((skill) => skill.name)).toEqual(['alpha', 'beta']);
  });

  it('识别 skills 子目录布局', async () => {
    const memory = createMemoryFs({
      '/hub/skills/alpha/SKILL.md': contentOf('alpha'),
      '/hub/skills/beta/SKILL.md': contentOf('beta'),
    });
    const result = await scanHub(memory.fs, '/hub');
    expect(result.layout).toBe('skills');
    expect(result.skills.map((skill) => skill.name)).toEqual(['alpha', 'beta']);
  });

  it('两种布局得到相同的技能集与 hash', async () => {
    const rootLayout = createMemoryFs({
      '/hub/alpha/SKILL.md': contentOf('alpha'),
    });
    const skillsLayout = createMemoryFs({
      '/hub/skills/alpha/SKILL.md': contentOf('alpha'),
    });
    const a = await scanHub(rootLayout.fs, '/hub');
    const b = await scanHub(skillsLayout.fs, '/hub');
    expect(a.skills.map((skill) => ({ name: skill.name, hash: skill.hash }))).toEqual(
      b.skills.map((skill) => ({ name: skill.name, hash: skill.hash })),
    );
  });

  it('缺少 SKILL.md 的目录被忽略', async () => {
    const memory = createMemoryFs({
      '/hub/alpha/SKILL.md': contentOf('alpha'),
      '/hub/notes/readme.md': 'not a skill',
    });
    const result = await scanHub(memory.fs, '/hub');
    expect(result.skills).toHaveLength(1);
  });
});

describe('buildHubDiff', () => {
  it('产出三类差异', async () => {
    const memory = createMemoryFs({
      '/hub/alpha/SKILL.md': contentOf('alpha'),
      '/hub/beta/SKILL.md': contentOf('beta'),
      '/hub/delta/SKILL.md': contentOf('delta'),
    });
    const records = [
      spoke('alpha'),
      spoke('gamma'),
      spoke('delta', {
        hash: sha256Hex(utf8Encode('---\nname: delta\n---\n不同的内容')),
      }),
    ];
    const report = await buildHubDiff(memory.fs, '/hub', records);

    expect(report.counts.onlyInHub).toBe(1);
    expect(report.onlyInHub[0]?.skillName).toBe('beta');
    expect(report.counts.onlyInSpoke).toBe(1);
    expect(report.onlyInSpoke[0]?.skillName).toBe('gamma');
    expect(report.counts.drift).toBe(1);
    expect(report.drift[0]?.skillName).toBe('delta');
    expect(report.drift[0]?.hub?.hash).toBe(hashOf('delta'));
    expect(report.drift[0]?.spokes[0]?.hash).not.toBe(hashOf('delta'));
  });

  it('同名同内容不产生差异项', async () => {
    const memory = createMemoryFs({ '/hub/alpha/SKILL.md': contentOf('alpha') });
    const report = await buildHubDiff(memory.fs, '/hub', [spoke('alpha')]);
    expect(report.counts.total).toBe(0);
  });

  it('默认脱敏，full 模式附带正文', async () => {
    const memory = createMemoryFs({ '/hub/alpha/SKILL.md': contentOf('alpha') });
    const plain = await buildHubDiff(memory.fs, '/hub', []);
    expect(plain.onlyInHub[0]?.hub?.content).toBeUndefined();
    const full = await buildHubDiff(memory.fs, '/hub', [], { full: true });
    expect(full.onlyInHub[0]?.hub?.content).toContain('正文 alpha');
  });

  it('执行对比不产生任何写入', async () => {
    const memory = createMemoryFs({ '/hub/alpha/SKILL.md': contentOf('alpha') });
    await buildHubDiff(memory.fs, '/hub', [spoke('gamma')]);
    expect(memory.writes).toEqual([]);
  });
});

describe('渲染', () => {
  it('markdown 报告包含三类分节', async () => {
    const memory = createMemoryFs({ '/hub/alpha/SKILL.md': contentOf('alpha') });
    const report = await buildHubDiff(memory.fs, '/hub', [spoke('gamma')]);
    const markdown = renderHubDiffMarkdown(report);
    expect(markdown).toContain('only-in-hub');
    expect(markdown).toContain('only-in-spoke');
    expect(markdown).toContain('drift');
    expect(markdown).toContain('布局：<name>/SKILL.md');
  });

  it('json 输出结构稳定且可被解析', async () => {
    const memory = createMemoryFs({ '/hub/alpha/SKILL.md': contentOf('alpha') });
    const report = await buildHubDiff(memory.fs, '/hub', []);
    const json = renderHubDiffJson(report);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(Object.keys(parsed).sort()).toEqual(
      ['counts', 'drift', 'full', 'generatedAt', 'hubRoot', 'layout', 'onlyInHub', 'onlyInSpoke'].sort(),
    );
    expect(Object.keys(parsed['counts'] as object).sort()).toEqual(
      ['drift', 'onlyInHub', 'onlyInSpoke', 'total'].sort(),
    );
  });
});

describe('resolveHub', () => {
  it('本地目录不存在时报错', async () => {
    const memory = createMemoryFs();
    await expect(
      resolveHub(memory.fs, '/missing', { cacheDir: '/cache' }),
    ).rejects.toThrow('hub 目录不存在');
  });

  it('远程仓库未提供 git 能力时报错', async () => {
    const memory = createMemoryFs();
    await expect(
      resolveHub(memory.fs, 'https://example.com/repo.git', { cacheDir: '/cache' }),
    ).rejects.toThrow('未提供 git 访问能力');
  });
});