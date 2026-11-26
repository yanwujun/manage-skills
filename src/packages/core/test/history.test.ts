import { describe, expect, it } from 'vitest';
import {
  buildHistoryEntryFromFile,
  detectHistoryChanges,
  findVersionDrifts,
  groupHistoryByName,
  hasBlob,
  loadHistory,
  persistHistoryEntries,
  planVersionBump,
  purgeSkillHistory,
  saveHistory,
  writeBlob,
  type HistoryEntry,
  type SkillRecord,
} from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';

const HISTORY = '/home/dev/.manage-skills/history.jsonl';
const BLOBS = '/home/dev/.manage-skills/blobs';
const RESULTS = '/home/dev/.manage-skills/evals/results';
const SKILL_PATH = '/home/dev/.claude/skills/foo/SKILL.md';
const CONTENT = '---\nname: foo\nversion: 1.0.0\n---\n\n# body\n';

function record(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'claude:foo/SKILL.md',
    instanceId: 'claude',
    agent: 'claude-code',
    root: '/home/dev/.claude/skills',
    path: SKILL_PATH,
    relativePath: 'foo/SKILL.md',
    hash: 'h1',
    size: 10,
    mtimeMs: 1000,
    frontmatter: { name: 'foo', version: '1.0.0' },
    status: 'ok',
    ...overrides,
  };
}

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    path: SKILL_PATH,
    instanceId: 'claude',
    agent: 'claude-code',
    name: 'foo',
    hash: 'h1',
    size: 10,
    mtimeMs: 1000,
    version: '1.0.0',
    cause: 'scan',
    recordedAt: '2026-11-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('detectHistoryChanges', () => {
  it('内容变化时追加 scan 条目', () => {
    const changes = detectHistoryChanges([record({ hash: 'h2' })], [entry()], {
      now: new Date('2026-11-26T00:00:00.000Z'),
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ hash: 'h2', cause: 'scan', version: '1.0.0' });
    expect(changes[0]?.recordedAt).toBe('2026-11-26T00:00:00.000Z');
  });

  it('内容未变不追加', () => {
    expect(detectHistoryChanges([record({ hash: 'h1' })], [entry()])).toEqual([]);
  });

  it('无历史时建立基线', () => {
    const changes = detectHistoryChanges([record()], []);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.cause).toBe('scan');
  });

  it('可指定变更来源与说明', () => {
    const changes = detectHistoryChanges([record({ hash: 'h2' })], [entry()], {
      cause: 'sync',
      note: '来自 hub',
    });
    expect(changes[0]).toMatchObject({ cause: 'sync', note: '来自 hub' });
  });

  it('空 hash 的记录被跳过', () => {
    expect(detectHistoryChanges([record({ hash: '' })], [])).toEqual([]);
  });
});

describe('findVersionDrifts', () => {
  it('单条目无漂移', () => {
    expect(findVersionDrifts([entry()])).toEqual([]);
  });

  it('同一版本段内容变化报漂移，基线为版本段首条', () => {
    const drifts = findVersionDrifts([
      entry({ hash: 'h1' }),
      entry({ hash: 'h2' }),
      entry({ hash: 'h3' }),
    ]);
    expect(drifts).toHaveLength(1);
    expect(drifts[0]).toMatchObject({
      path: SKILL_PATH,
      latest: expect.objectContaining({ hash: 'h3' }),
      baseline: expect.objectContaining({ hash: 'h1' }),
    });
  });

  it('版本变化后不报漂移', () => {
    expect(
      findVersionDrifts([
        entry({ hash: 'h1', version: '1.0.0' }),
        entry({ hash: 'h2', version: '1.0.1' }),
      ]),
    ).toEqual([]);
  });

  it('版本内改动后又改回基线内容不报', () => {
    expect(
      findVersionDrifts([
        entry({ hash: 'h1' }),
        entry({ hash: 'h2' }),
        entry({ hash: 'h1' }),
      ]),
    ).toEqual([]);
  });

  it('版本缺失时同类按同段处理', () => {
    const drifts = findVersionDrifts([
      entry({ hash: 'h1', version: undefined }),
      entry({ hash: 'h2', version: undefined }),
    ]);
    expect(drifts).toHaveLength(1);
  });

  it('不同路径独立判定', () => {
    const drifts = findVersionDrifts([
      entry({ path: '/a/foo/SKILL.md', hash: 'a1' }),
      entry({ path: '/b/bar/SKILL.md', name: 'bar', hash: 'b1' }),
      entry({ path: '/a/foo/SKILL.md', hash: 'a2' }),
    ]);
    expect(drifts.map((drift) => drift.path)).toEqual(['/a/foo/SKILL.md']);
  });
});

describe('planVersionBump', () => {
  it('按位递增', () => {
    expect(planVersionBump('1.2.3', 'patch')).toBe('1.2.4');
    expect(planVersionBump('1.2.3', 'minor')).toBe('1.3.0');
    expect(planVersionBump('1.2.3', 'major')).toBe('2.0.0');
  });

  it('缺失版本时给初版 0.1.0', () => {
    expect(planVersionBump(undefined, 'patch')).toBe('0.1.0');
    expect(planVersionBump(undefined, 'major')).toBe('0.1.0');
  });

  it('非三段式版本报错', () => {
    expect(() => planVersionBump('v1.2', 'patch')).toThrow('版本号无法解析');
  });
});

describe('buildHistoryEntryFromFile', () => {
  it('从文件构建条目并解析版本', async () => {
    const memory = createMemoryFs({ [SKILL_PATH]: CONTENT });
    const built = await buildHistoryEntryFromFile(memory.fs, SKILL_PATH, {
      agent: 'claude-code',
      instanceId: 'claude',
      cause: 'bump',
      note: '升级',
      now: new Date('2026-11-26T00:00:00.000Z'),
    });

    expect(built).toMatchObject({
      name: 'foo',
      version: '1.0.0',
      cause: 'bump',
      note: '升级',
      instanceId: 'claude',
    });
    expect(built?.hash).toHaveLength(64);
    expect(built?.recordedAt).toBe('2026-11-26T00:00:00.000Z');
  });

  it('文件不存在返回 null', async () => {
    const memory = createMemoryFs();
    expect(await buildHistoryEntryFromFile(memory.fs, SKILL_PATH, { agent: 'custom', cause: 'sync' })).toBeNull();
  });
});

describe('persistHistoryEntries', () => {
  it('写入快照与历史，且不触碰源文件', async () => {
    const memory = createMemoryFs({ [SKILL_PATH]: CONTENT });
    const entries = detectHistoryChanges([record()], []);
    const result = await persistHistoryEntries(memory.fs, { historyPath: HISTORY, blobsDir: BLOBS }, entries);

    expect(result.added).toHaveLength(1);
    expect(result.warnings).toEqual([]);
    expect(memory.files.get(SKILL_PATH)).toBe(CONTENT);
    expect(memory.writes.every((path) => path.startsWith('/home/dev/.manage-skills'))).toBe(true);

    const loaded = await loadHistory(memory.fs, HISTORY);
    expect(loaded.entries).toHaveLength(1);
    expect(await hasBlob(memory.fs, BLOBS, entries[0]!.hash)).toBe(true);
  });

  it('同路径同 hash 不重复追加', async () => {
    const memory = createMemoryFs({ [SKILL_PATH]: CONTENT });
    const entries = detectHistoryChanges([record()], []);
    await persistHistoryEntries(memory.fs, { historyPath: HISTORY, blobsDir: BLOBS }, entries);
    const second = await persistHistoryEntries(memory.fs, { historyPath: HISTORY, blobsDir: BLOBS }, entries, entries);

    expect(second.added).toEqual([]);
    const loaded = await loadHistory(memory.fs, HISTORY);
    expect(loaded.entries).toHaveLength(1);
  });

  it('sync 条目写入后扫描不再重复记录', async () => {
    const memory = createMemoryFs({ [SKILL_PATH]: CONTENT });
    const synced = await buildHistoryEntryFromFile(memory.fs, SKILL_PATH, {
      agent: 'claude-code',
      instanceId: 'claude',
      cause: 'sync',
    });
    expect(synced?.cause).toBe('sync');

    await persistHistoryEntries(memory.fs, { historyPath: HISTORY, blobsDir: BLOBS }, [synced!]);
    const loaded = await loadHistory(memory.fs, HISTORY);
    const changes = detectHistoryChanges([record({ hash: synced!.hash })], loaded.entries);
    expect(changes).toEqual([]);
  });

  it('读取失败只告警不中断', async () => {
    const memory = createMemoryFs();
    const result = await persistHistoryEntries(
      memory.fs,
      { historyPath: HISTORY, blobsDir: BLOBS },
      [entry()],
    );
    expect(result.added).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });
});

describe('groupHistoryByName', () => {
  it('同名不同路径分组且按时间倒序', () => {
    const groups = groupHistoryByName([
      entry({ path: '/a/foo/SKILL.md', recordedAt: '2026-01-01T00:00:00.000Z' }),
      entry({ path: '/b/foo/SKILL.md', recordedAt: '2026-02-01T00:00:00.000Z' }),
      entry({ path: '/c/bar/SKILL.md', name: 'bar', recordedAt: '2026-03-01T00:00:00.000Z' }),
    ]);

    expect([...groups.keys()].sort()).toEqual(['bar', 'foo']);
    expect(groups.get('foo')?.map((item) => item.path)).toEqual([
      '/b/foo/SKILL.md',
      '/a/foo/SKILL.md',
    ]);
  });
});

describe('purgeSkillHistory', () => {
  it('移除目标条目并回收独占快照，保留共享快照', async () => {
    const memory = createMemoryFs();
    await writeBlob(memory.fs, BLOBS, 'h1', 'foo-v1');
    await writeBlob(memory.fs, BLOBS, 'h2', 'shared');
    await writeBlob(memory.fs, BLOBS, 'h3', 'orphan');

    const fooA = entry({ path: '/a/foo/SKILL.md', hash: 'h1' });
    const fooB = entry({ path: '/b/foo/SKILL.md', hash: 'h2' });
    const bar = entry({ path: '/c/bar/SKILL.md', name: 'bar', hash: 'h2' });
    await saveHistory(memory.fs, HISTORY, [fooA, fooB, bar]);

    const result = await purgeSkillHistory(memory.fs, { historyPath: HISTORY, blobsDir: BLOBS }, 'foo');

    expect(result.removedEntries).toBe(2);
    expect(result.removedBlobs.sort()).toEqual(['h1', 'h3']);
    expect(await hasBlob(memory.fs, BLOBS, 'h2')).toBe(true);
    const loaded = await loadHistory(memory.fs, HISTORY);
    expect(loaded.entries.map((item) => item.name)).toEqual(['bar']);
  });

  it('评测结果引用快照时不回收', async () => {
    const memory = createMemoryFs({
      [`${RESULTS}/foo/run-1.json`]: JSON.stringify({ fromHash: 'h1', toHash: 'h2' }),
    });
    await writeBlob(memory.fs, BLOBS, 'h1', 'foo-v1');
    await writeBlob(memory.fs, BLOBS, 'h2', 'foo-v2');
    await saveHistory(memory.fs, HISTORY, [entry({ hash: 'h1' }), entry({ hash: 'h2' })]);

    const result = await purgeSkillHistory(
      memory.fs,
      { historyPath: HISTORY, blobsDir: BLOBS, evalResultsDir: RESULTS },
      'foo',
    );

    expect(result.removedEntries).toBe(2);
    expect(result.removedBlobs).toEqual([]);
    expect(await hasBlob(memory.fs, BLOBS, 'h1')).toBe(true);
    expect(await hasBlob(memory.fs, BLOBS, 'h2')).toBe(true);
  });
});