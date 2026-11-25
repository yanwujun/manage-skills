import { promises as fsp } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addTags,
  effectiveTags,
  filterByTags,
  loadIndex,
  removeTags,
  saveTags,
  scanInstances,
  suggestTags,
  tagCounts,
  INDEX_SCHEMA_VERSION,
  type ManageSkillsIndex,
  type SkillRecord,
} from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';
import { createNodeFs } from './helpers/node-fs.js';

const INDEX_PATH = '/home/dev/.manage-skills/index.json';

function record(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'claude:foo/SKILL.md',
    instanceId: 'claude',
    agent: 'claude-code',
    root: '/home/dev/.claude/skills',
    path: '/home/dev/.claude/skills/foo/SKILL.md',
    relativePath: 'foo/SKILL.md',
    hash: 'abc',
    size: 10,
    mtimeMs: 1000,
    frontmatter: { name: 'foo' },
    status: 'ok',
    ...overrides,
  };
}

describe('有效标签', () => {
  it('frontmatter 标签直接生效', () => {
    const item = record({ frontmatter: { name: 'foo', tags: ['pdf', 'Review'] } });
    expect(effectiveTags(item)).toEqual(['pdf', 'review']);
  });

  it('追加的标签合并进有效集合', () => {
    const item = addTags(record({ frontmatter: { name: 'foo', tags: ['pdf'] } }), ['internal']);
    expect(effectiveTags(item)).toEqual(['internal', 'pdf']);
  });

  it('移除的标签从有效集合消失，但源数据不变', () => {
    const item = removeTags(record({ frontmatter: { name: 'foo', tags: ['pdf', 'review'] } }), ['review']);
    expect(effectiveTags(item)).toEqual(['pdf']);
    expect(item.frontmatter.tags).toEqual(['pdf', 'review']);
  });

  it('大小写归一', () => {
    const item = addTags(record(), ['PDF']);
    expect(effectiveTags(item)).toEqual(['pdf']);
  });

  it('重复添加同一标签不会重复', () => {
    let item = addTags(record(), ['pdf']);
    item = addTags(item, ['pdf']);
    expect(effectiveTags(item)).toEqual(['pdf']);
  });

  it('移除后重新添加会撤销移除记录', () => {
    let item = removeTags(record({ frontmatter: { name: 'foo', tags: ['pdf'] } }), ['pdf']);
    item = addTags(item, ['pdf']);
    expect(effectiveTags(item)).toEqual(['pdf']);
  });
});

describe('筛选与计数', () => {
  const records = [
    record({ path: '/a', relativePath: 'a', tagState: { added: ['pdf'], removed: [] } }),
    record({ path: '/b', relativePath: 'b', tagState: { added: ['pdf', 'internal'], removed: [] } }),
    record({ path: '/c', relativePath: 'c', frontmatter: { name: 'c', tags: ['internal'] } }),
  ];

  it('单标签筛选', () => {
    expect(filterByTags(records, ['pdf']).map((item) => item.path)).toEqual(['/a', '/b']);
  });

  it('多标签筛选为 AND 语义', () => {
    expect(filterByTags(records, ['pdf', 'internal']).map((item) => item.path)).toEqual(['/b']);
  });

  it('标签计数按数量排序', () => {
    expect(tagCounts(records)).toEqual([
      { tag: 'internal', count: 2 },
      { tag: 'pdf', count: 2 },
    ]);
  });
});

describe('建议标签', () => {
  it('根据关键词给出建议', () => {
    const item = record({ frontmatter: { name: 'pdf-toolkit', description: 'PDF 合并' } });
    expect(suggestTags(item)).toContain('pdf');
  });

  it('建议值不进入有效标签', () => {
    const item = record({ frontmatter: { name: 'push-test', description: '测试用例' } });
    expect(suggestTags(item)).toContain('testing');
    expect(effectiveTags(item)).toEqual([]);
  });
});

describe('批量写入 sidecar', () => {
  it('批量打标并持久化，源文件不变', async () => {
    const memory = createMemoryFs();
    const index: ManageSkillsIndex = {
      schemaVersion: INDEX_SCHEMA_VERSION,
      generatedAt: '',
      skills: [record(), record({ path: '/b', relativePath: 'b' })],
    };
    const next = await saveTags(memory.fs, INDEX_PATH, index, ['/home/dev/.claude/skills/foo/SKILL.md', '/b'], {
      add: ['legacy'],
    });

    expect(next.skills.every((item) => effectiveTags(item).includes('legacy'))).toBe(true);

    const loaded = await loadIndex(memory.fs, INDEX_PATH);
    expect(loaded.index?.skills[0]?.tagState?.added).toEqual(['legacy']);
    expect(memory.writes).toEqual([INDEX_PATH]);
  });

  it('批量移除标签', async () => {
    const memory = createMemoryFs();
    const index: ManageSkillsIndex = {
      schemaVersion: INDEX_SCHEMA_VERSION,
      generatedAt: '',
      skills: [record({ tagState: { added: ['legacy'], removed: [] } })],
    };
    const next = await saveTags(memory.fs, INDEX_PATH, index, ['/home/dev/.claude/skills/foo/SKILL.md'], {
      remove: ['legacy'],
    });
    expect(effectiveTags(next.skills[0]!)).toEqual([]);
  });

  it('路径不在索引中时报错', async () => {
    const memory = createMemoryFs();
    const index: ManageSkillsIndex = {
      schemaVersion: INDEX_SCHEMA_VERSION,
      generatedAt: '',
      skills: [record()],
    };
    await expect(saveTags(memory.fs, INDEX_PATH, index, ['/missing'], { add: ['x'] })).rejects.toThrow(
      '索引中不存在该技能',
    );
  });

  it('10 个技能批量打标后源文件 mtime 全部不变', async () => {
    const root = await mkdtemp(join(tmpdir(), 'manage-skills-tags-'));
    try {
      for (let index = 0; index < 10; index += 1) {
        const dir = join(root, `skill-${index}`);
        await fsp.mkdir(dir, { recursive: true });
        await fsp.writeFile(
          join(dir, 'SKILL.md'),
          `---\nname: skill-${index}\n---\nbody`,
          'utf8',
        );
      }

      const filePaths = Array.from({ length: 10 }, (_, index) =>
        join(root, `skill-${index}`, 'SKILL.md'),
      );
      const before = await Promise.all(filePaths.map((path) => fsp.stat(path)));

      const fs = createNodeFs();
      const records = await scanInstances(fs, [
        { id: 'tags', agent: 'claude-code', root, scope: 'global', os: 'linux' },
      ]);
      const index: ManageSkillsIndex = {
        schemaVersion: INDEX_SCHEMA_VERSION,
        generatedAt: '',
        skills: records,
      };
      const next = await saveTags(fs, join(root, '.manage-skills', 'index.json'), index, records.map((item) => item.path), {
        add: ['batch'],
      });
      expect(next.skills.every((item) => effectiveTags(item).includes('batch'))).toBe(true);

      const after = await Promise.all(filePaths.map((path) => fsp.stat(path)));
      for (let i = 0; i < filePaths.length; i += 1) {
        expect(after[i]?.mtimeMs).toBe(before[i]?.mtimeMs);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});