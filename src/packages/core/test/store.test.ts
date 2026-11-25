import { describe, expect, it } from 'vitest';
import {
  INDEX_SCHEMA_VERSION,
  loadIndex,
  mergeScan,
  saveIndex,
  type ManageSkillsIndex,
  type SkillRecord,
} from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';

const INDEX_PATH = '/home/dev/.manage-skills/index.json';

function record(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'claude:skills/foo/SKILL.md',
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

describe('index store', () => {
  it('保存后可完整读回', async () => {
    const memory = createMemoryFs();
    const index: ManageSkillsIndex = {
      schemaVersion: INDEX_SCHEMA_VERSION,
      generatedAt: '2026-11-25T00:00:00.000Z',
      skills: [record()],
    };
    await saveIndex(memory.fs, INDEX_PATH, index);

    const loaded = await loadIndex(memory.fs, INDEX_PATH);
    expect(loaded.error).toBeUndefined();
    expect(loaded.index?.schemaVersion).toBe(index.schemaVersion);
    expect(loaded.index?.generatedAt).toBe(index.generatedAt);
    expect(loaded.index?.skills).toHaveLength(index.skills.length);
    expect(loaded.index?.skills[0]).toMatchObject(index.skills[0]!);
  });

  it('索引不存在时返回 null 且无错误', async () => {
    const memory = createMemoryFs();
    const loaded = await loadIndex(memory.fs, INDEX_PATH);
    expect(loaded.index).toBeNull();
    expect(loaded.error).toBeUndefined();
  });

  it('未知版本拒绝覆盖并返回错误', async () => {
    const memory = createMemoryFs({
      [INDEX_PATH]: JSON.stringify({ schemaVersion: 99, skills: [] }),
    });
    const loaded = await loadIndex(memory.fs, INDEX_PATH);
    expect(loaded.index).toBeNull();
    expect(loaded.error).toContain('不支持的索引版本');
    expect(memory.writes).toHaveLength(0);
  });

  it('saveIndex 拒绝写入错误版本', async () => {
    const memory = createMemoryFs();
    await expect(
      saveIndex(memory.fs, INDEX_PATH, {
        schemaVersion: 99,
        generatedAt: '',
        skills: [],
      }),
    ).rejects.toThrow('拒绝写入不支持的索引版本');
  });

  it('损坏的 JSON 返回错误而非抛异常', async () => {
    const memory = createMemoryFs({ [INDEX_PATH]: '{not json' });
    const loaded = await loadIndex(memory.fs, INDEX_PATH);
    expect(loaded.index).toBeNull();
    expect(loaded.error).toContain('索引读取失败');
  });

  it('v1 索引可加载并补齐 tagState', async () => {
    const legacy = {
      schemaVersion: 1,
      generatedAt: '2026-11-01T00:00:00.000Z',
      skills: [record()],
    };
    const memory = createMemoryFs({ [INDEX_PATH]: JSON.stringify(legacy) });
    const loaded = await loadIndex(memory.fs, INDEX_PATH);

    expect(loaded.error).toBeUndefined();
    expect(loaded.index?.schemaVersion).toBe(INDEX_SCHEMA_VERSION);
    expect(loaded.index?.skills[0]?.hash).toBe('abc');
    expect(loaded.index?.skills[0]?.tagState).toEqual({ added: [], removed: [] });
  });
});

describe('mergeScan', () => {
  it('新记录覆盖同路径旧记录并保留手工字段', () => {
    const previous: ManageSkillsIndex = {
      schemaVersion: INDEX_SCHEMA_VERSION,
      generatedAt: '',
      skills: [{ ...record(), tagState: { added: ['manual'], removed: [] } }],
    };
    const next = record({ hash: 'def' });
    const merged = mergeScan(previous, [next]);

    expect(merged.skills).toHaveLength(1);
    expect(merged.skills[0]?.hash).toBe('def');
    expect(merged.skills[0]?.tagState).toEqual({ added: ['manual'], removed: [] });
    expect(merged.skills[0]?.stale).toBe(false);
  });

  it('源文件消失的旧条目标记 stale 并保留', () => {
    const previous: ManageSkillsIndex = {
      schemaVersion: INDEX_SCHEMA_VERSION,
      generatedAt: '',
      skills: [record({ path: '/gone/SKILL.md', relativePath: 'gone/SKILL.md' })],
    };
    const merged = mergeScan(previous, []);
    expect(merged.skills).toHaveLength(1);
    expect(merged.skills[0]?.stale).toBe(true);
  });

  it('结果按路径稳定排序', () => {
    const a = record({ path: '/b/SKILL.md', relativePath: 'b/SKILL.md' });
    const b = record({ path: '/a/SKILL.md', relativePath: 'a/SKILL.md' });
    const merged = mergeScan(null, [a, b]);
    expect(merged.skills.map((item) => item.path)).toEqual(['/a/SKILL.md', '/b/SKILL.md']);
  });
});