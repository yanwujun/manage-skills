import { promises as fsp } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanInstances, type AgentInstance } from '../src/index.js';
import { createNodeFs } from './helpers/node-fs.js';

const SKILL_COUNT = 500;

let root = '';
let instance: AgentInstance;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'manage-skills-bench-'));
  instance = { id: 'bench', agent: 'claude-code', root, scope: 'global', os: 'linux' };
  const body = '技能正文内容，用于基准测试。'.repeat(200);
  for (let index = 0; index < SKILL_COUNT; index += 1) {
    const dir = join(root, `skill-${index}`);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(
      join(dir, 'SKILL.md'),
      `---\nname: skill-${index}\ndescription: 基准技能 ${index}\n---\n\n${body}\n`,
      'utf8',
    );
  }
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('500 份技能基准', () => {
  it('全量扫描在 30 秒内完成', async () => {
    const start = performance.now();
    const records = await scanInstances(createNodeFs(), [instance]);
    const elapsed = performance.now() - start;

    console.log(`[bench] 扫描 ${records.length} 份技能耗时 ${elapsed.toFixed(0)}ms`);
    expect(records).toHaveLength(SKILL_COUNT);
    expect(records.every((record) => record.status === 'ok')).toBe(true);
    expect(elapsed).toBeLessThan(30_000);
  }, 60_000);
});