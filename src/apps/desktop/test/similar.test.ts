import { describe, expect, it, beforeEach } from 'vitest';
import type { SkillRecord } from '@manage-skills/core';
import { filterGroupsByTags, runSimilarityInWorker } from '../src/features/similar/similarity-client';
import { makePairKey, useUiStore } from '../src/store';

function makeRecord(overrides: Partial<SkillRecord> & { path: string; name: string }): SkillRecord {
  const { path, name, ...rest } = overrides;
  return {
    agent: 'cursor',
    scope: 'user',
    path,
    relativePath: `${name}/SKILL.md`,
    status: 'ok',
    frontmatter: {
      name,
      description: `${name} description`,
      tags: [],
    },
    hash: `hash-${name}`,
    size: 100,
    mtimeMs: 1000,
    ...rest,
  };
}

describe('desktop tag & similarity view logic', () => {
  beforeEach(() => {
    useUiStore.setState({
      view: 'skills',
      search: '',
      filters: { source: '', state: '', tags: [] },
      selections: {},
      ignoredPairs: [],
      similarityThreshold: 0.6,
    });
  });

  it('toggles and clears tags without clearing source/state filters', () => {
    const store = useUiStore.getState();
    store.setFilters({ source: 'cursor', state: 'ok' });
    store.toggleTag('pdf');
    store.toggleTag('review');
    expect(useUiStore.getState().filters.tags).toEqual(['pdf', 'review']);

    useUiStore.getState().clearTags();
    expect(useUiStore.getState().filters.tags).toEqual([]);
    expect(useUiStore.getState().filters.source).toBe('cursor');
    expect(useUiStore.getState().filters.state).toBe('ok');
  });

  it('computes similarity groups, respects ignoredPairs, and filters by tags', async () => {
    const a = makeRecord({
      path: '/a/SKILL.md',
      name: 'pdf-helper',
      frontmatter: { name: 'pdf-helper', description: 'extract tables from pdf documents', tags: ['pdf'] },
    });
    const b = makeRecord({
      path: '/b/SKILL.md',
      name: 'pdf-extractor',
      agent: 'claude-code',
      frontmatter: { name: 'pdf-extractor', description: 'extract tables from pdf documents', tags: ['pdf', 'internal'] },
    });
    const body = '---\nname: pdf\ndescription: extract tables from pdf documents\n---\nRead pdf pages and extract structured tables into markdown format cleanly.';
    const contents = {
      [a.path]: body,
      [b.path]: body,
    };

    const result = await runSimilarityInWorker({
      records: [a, b],
      contents,
      showThreshold: 0.6,
      ignoredPairs: [],
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.pairs[0]!.descriptionScore).toBeGreaterThan(0.8);
    expect(result.groups[0]!.pairs[0]!.bodyScore).toBeGreaterThan(0.8);

    const byPath = new Map([
      [a.path, a],
      [b.path, b],
    ]);
    expect(filterGroupsByTags(result.groups, byPath, ['pdf'])).toHaveLength(1);
    expect(filterGroupsByTags(result.groups, byPath, ['pdf', 'internal'])).toHaveLength(1);
    expect(filterGroupsByTags(result.groups, byPath, ['nonexistent'])).toHaveLength(0);

    // 标记忽略后不再出现
    useUiStore.getState().ignorePair(a.path, b.path);
    const ignoredResult = await runSimilarityInWorker({
      records: [a, b],
      contents,
      showThreshold: 0.6,
      ignoredPairs: useUiStore.getState().ignoredPairs,
    });
    expect(ignoredResult.groups).toHaveLength(0);
    expect(useUiStore.getState().ignoredPairs).toContain(makePairKey(a.path, b.path));
  });
});
