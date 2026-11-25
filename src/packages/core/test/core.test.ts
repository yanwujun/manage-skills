import { describe, expect, it } from 'vitest';
import { REGISTERED_ADAPTERS, SCHEMA_VERSION } from '../src/index.js';

describe('core skeleton', () => {
  it('列出四个内置 agent 适配器', () => {
    expect(REGISTERED_ADAPTERS).toEqual(['claude-code', 'cursor', 'codex', 'hermes']);
  });

  it('索引 schema 版本为 1', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});