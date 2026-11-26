import { describe, expect, it } from 'vitest';
import {
  appendHistory,
  hasBlob,
  listBlobHashes,
  loadHistory,
  readBlob,
  removeBlob,
  saveHistory,
  writeBlob,
  type HistoryEntry,
} from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';

const HISTORY = '/home/dev/.manage-skills/history.jsonl';
const BLOBS = '/home/dev/.manage-skills/blobs';

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    path: '/home/dev/.claude/skills/foo/SKILL.md',
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

describe('历史文件读写', () => {
  it('追加后读取字段完整', async () => {
    const memory = createMemoryFs();
    await appendHistory(memory.fs, HISTORY, [entry(), entry({ hash: 'h2', cause: 'bump', note: '优化触发词' })]);

    const loaded = await loadHistory(memory.fs, HISTORY);
    expect(loaded.error).toBeUndefined();
    expect(loaded.entries).toHaveLength(2);
    expect(loaded.entries[1]).toMatchObject({ hash: 'h2', cause: 'bump', note: '优化触发词' });
  });

  it('追加保留已有内容并补齐换行', async () => {
    const memory = createMemoryFs({ [HISTORY]: JSON.stringify(entry()) });
    await appendHistory(memory.fs, HISTORY, [entry({ hash: 'h2' })]);

    const loaded = await loadHistory(memory.fs, HISTORY);
    expect(loaded.entries.map((item) => item.hash)).toEqual(['h1', 'h2']);
  });

  it('损坏行跳过并计数', async () => {
    const memory = createMemoryFs({
      [HISTORY]: `${JSON.stringify(entry())}\nnot-json\n${JSON.stringify({ path: 'x' })}\n`,
    });
    const loaded = await loadHistory(memory.fs, HISTORY);
    expect(loaded.entries).toHaveLength(1);
    expect(loaded.skipped).toBe(2);
  });

  it('文件不存在返回空列表', async () => {
    const memory = createMemoryFs();
    const loaded = await loadHistory(memory.fs, HISTORY);
    expect(loaded.entries).toEqual([]);
    expect(loaded.skipped).toBe(0);
  });

  it('saveHistory 整体重写', async () => {
    const memory = createMemoryFs({ [HISTORY]: `${JSON.stringify(entry({ hash: 'old' }))}\n` });
    await saveHistory(memory.fs, HISTORY, [entry({ hash: 'new' })]);

    const loaded = await loadHistory(memory.fs, HISTORY);
    expect(loaded.entries.map((item) => item.hash)).toEqual(['new']);
  });

  it('写入空列表得到空文件', async () => {
    const memory = createMemoryFs({ [HISTORY]: 'x' });
    await saveHistory(memory.fs, HISTORY, []);
    expect(memory.files.get(HISTORY)).toBe('');
  });
});

describe('内容寻址快照', () => {
  it('同内容两次写入只产生一个文件', async () => {
    const memory = createMemoryFs();
    const first = await writeBlob(memory.fs, BLOBS, 'abc123', 'hello');
    const second = await writeBlob(memory.fs, BLOBS, 'abc123', 'hello');

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await listBlobHashes(memory.fs, BLOBS)).toEqual(['abc123']);
    expect(memory.writes.filter((path) => path.startsWith(BLOBS))).toHaveLength(1);
  });

  it('不同 hash 分别保存并可读回', async () => {
    const memory = createMemoryFs();
    await writeBlob(memory.fs, BLOBS, 'a', 'A');
    await writeBlob(memory.fs, BLOBS, 'b', 'B');

    expect(await readBlob(memory.fs, BLOBS, 'a')).toBe('A');
    expect(await readBlob(memory.fs, BLOBS, 'b')).toBe('B');
    expect(await listBlobHashes(memory.fs, BLOBS)).toEqual(['a', 'b']);
  });

  it('读取不存在的快照返回 null', async () => {
    const memory = createMemoryFs();
    expect(await readBlob(memory.fs, BLOBS, 'missing')).toBeNull();
    expect(await hasBlob(memory.fs, BLOBS, 'missing')).toBe(false);
  });

  it('删除后目录不可见', async () => {
    const memory = createMemoryFs();
    await writeBlob(memory.fs, BLOBS, 'a', 'A');
    await removeBlob(memory.fs, BLOBS, 'a');
    expect(await hasBlob(memory.fs, BLOBS, 'a')).toBe(false);
    expect(await listBlobHashes(memory.fs, BLOBS)).toEqual([]);
  });

  it('空 hash 拒绝写入', async () => {
    const memory = createMemoryFs();
    await expect(writeBlob(memory.fs, BLOBS, '', 'x')).rejects.toThrow('快照 hash 不能为空');
  });

  it('目录不存在时列表为空', async () => {
    const memory = createMemoryFs();
    expect(await listBlobHashes(memory.fs, BLOBS)).toEqual([]);
  });
});