import { describe, expect, it } from 'vitest';
import {
  INDEX_SCHEMA_VERSION,
  listCategories,
  loadIndex,
  resolveCategory,
  saveCategory,
  setCategory,
  suggestCategory,
  type ManageSkillsIndex,
  type SkillRecord,
} from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';

const SKILL_PATH = '/home/dev/.claude/skills/foo/SKILL.md';
const INDEX_PATH = '/home/dev/.manage-skills/index.json';

function record(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'claude:foo/SKILL.md',
    instanceId: 'claude',
    agent: 'claude-code',
    root: '/home/dev/.claude/skills',
    path: SKILL_PATH,
    relativePath: 'foo/SKILL.md',
    hash: 'abc',
    size: 10,
    mtimeMs: 1000,
    frontmatter: { name: 'foo' },
    status: 'ok',
    ...overrides,
  };
}

describe('分类优先级', () => {
  it('frontmatter 分类最优先', () => {
    const item = record({
      frontmatter: { name: 'foo', category: 'from-file' },
      category: { value: 'from-sidecar', source: 'sidecar' },
    });
    expect(resolveCategory(item)).toEqual({ value: 'from-file', source: 'frontmatter' });
  });

  it('sidecar 标注次之', () => {
    const item = record({ category: { value: 'manual', source: 'sidecar' } });
    expect(resolveCategory(item)).toEqual({ value: 'manual', source: 'sidecar' });
  });

  it('无标注时给出建议值并标记 suggested', () => {
    const item = record({ frontmatter: { name: 'pdf-toolkit', description: 'PDF 合并' } });
    expect(resolveCategory(item)).toEqual({ value: 'documents', source: 'suggested' });
  });

  it('没有匹配规则时返回 null', () => {
    const item = record({ frontmatter: { name: 'zzz' } });
    expect(resolveCategory(item)).toBeNull();
  });

  it('关键词规则命中 testing', () => {
    expect(suggestCategory(record({ frontmatter: { name: 'e2e-test-runner' } }))).toBe('testing');
  });
});

describe('setCategory', () => {
  it('设置分类只改记录，不改 frontmatter', () => {
    const item = record({ frontmatter: { name: 'foo' } });
    const next = setCategory(item, 'review');
    expect(next.category).toEqual({ value: 'review', source: 'sidecar' });
    expect(next.frontmatter.category).toBeUndefined();
  });

  it('传 null 清除分类', () => {
    const item = record({ category: { value: 'review', source: 'sidecar' } });
    expect(setCategory(item, null).category).toBeUndefined();
  });
});

describe('saveCategory', () => {
  it('写入 sidecar 并可重新读回', async () => {
    const source = '---\nname: foo\n---\nbody';
    const memory = createMemoryFs({ [SKILL_PATH]: source });
    const index: ManageSkillsIndex = {
      schemaVersion: INDEX_SCHEMA_VERSION,
      generatedAt: '',
      skills: [record()],
    };
    const next = await saveCategory(memory.fs, INDEX_PATH, index, SKILL_PATH, 'testing');
    expect(next.skills[0]?.category).toEqual({ value: 'testing', source: 'sidecar' });

    const loaded = await loadIndex(memory.fs, INDEX_PATH);
    expect(loaded.index?.skills[0]?.category?.value).toBe('testing');

    expect(memory.files.get(SKILL_PATH)).toBe(source);
    expect(memory.writes).toEqual([INDEX_PATH]);
  });

  it('路径不在索引中时报错', async () => {
    const memory = createMemoryFs();
    const index: ManageSkillsIndex = {
      schemaVersion: INDEX_SCHEMA_VERSION,
      generatedAt: '',
      skills: [record()],
    };
    await expect(
      saveCategory(memory.fs, INDEX_PATH, index, '/missing/SKILL.md', 'x'),
    ).rejects.toThrow('索引中不存在该技能');
  });
});

describe('listCategories', () => {
  it('按分类计数并排序', () => {
    const index: ManageSkillsIndex = {
      schemaVersion: INDEX_SCHEMA_VERSION,
      generatedAt: '',
      skills: [
        record({ path: '/a/SKILL.md', relativePath: 'a/SKILL.md', category: { value: 'review', source: 'sidecar' } }),
        record({ path: '/b/SKILL.md', relativePath: 'b/SKILL.md', category: { value: 'review', source: 'sidecar' } }),
        record({ path: '/c/SKILL.md', relativePath: 'c/SKILL.md', category: { value: 'testing', source: 'sidecar' } }),
      ],
    };
    expect(listCategories(index)).toEqual([
      { value: 'review', count: 2 },
      { value: 'testing', count: 1 },
    ]);
  });
});