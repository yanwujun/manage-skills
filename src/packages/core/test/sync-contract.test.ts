import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildSyncPlan,
  savePlan,
  loadPlan,
  validateSyncPlan,
  type SyncPlan,
} from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';

const SCHEMA_PATH = fileURLToPath(new URL('../schema/sync-plan.schema.json', import.meta.url));

interface JsonSchema {
  required: string[];
  properties: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean;
}

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as JsonSchema;

/** 极简 JSON Schema 校验：required + additionalProperties，足够覆盖跨端契约。 */
function checkObject(value: unknown, node: JsonSchema, path: string): string[] {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [`${path} 必须是对象`];
  }
  const record = value as Record<string, unknown>;
  for (const key of node.required) {
    if (!(key in record)) errors.push(`${path} 缺少字段：${key}`);
  }
  if (node.additionalProperties === false) {
    for (const key of Object.keys(record)) {
      if (!(key in node.properties)) errors.push(`${path} 未知字段：${key}`);
    }
  }
  for (const [key, child] of Object.entries(node.properties)) {
    if (key in record && child.type === 'object') {
      errors.push(...checkObject(record[key], child, `${path}.${key}`));
    }
  }
  const items = node.properties['items'];
  if (items?.items && Array.isArray(record['items'])) {
    record['items'].forEach((item, index) => {
      errors.push(...checkObject(item, items.items as JsonSchema, `${path}.items[${index}]`));
    });
  }
  return errors;
}

function validateAgainstSchema(plan: unknown): string[] {
  return checkObject(plan, schema, 'plan');
}

describe('计划 JSON 跨端契约', () => {
  it('schema 与代码校验对合法计划一致', async () => {
    const memory = createMemoryFs({ '/hub/alpha/SKILL.md': '---\nname: alpha\n---\nbody' });
    const plan = await buildSyncPlan(memory.fs, '/hub', []);
    expect(validateSyncPlan(plan)).toEqual([]);
    expect(validateAgainstSchema(plan)).toEqual([]);
  });

  it('缺字段时两端都报错', () => {
    const broken = { id: 'x', hubRoot: '/hub' } as unknown as SyncPlan;
    expect(validateSyncPlan(broken).length).toBeGreaterThan(0);
    expect(validateAgainstSchema(broken).length).toBeGreaterThan(0);
  });

  it('多余字段时两端都报错', () => {
    const withExtra = {
      id: 'x',
      createdAt: '',
      hubRoot: '/hub',
      direction: 'push',
      items: [],
      counts: { create: 0, update: 0, link: 0, skipped: 0, conflict: 0, total: 0 },
      extra: true,
    };
    expect(validateSyncPlan(withExtra)).toContain('未知字段：extra');
    expect(validateAgainstSchema(withExtra)).toContain('plan 未知字段：extra');
  });

  it('schema 必填字段与代码常量一致', () => {
    const planRequired = ['id', 'createdAt', 'hubRoot', 'direction', 'items', 'counts'];
    expect([...schema.required].sort()).toEqual([...planRequired].sort());

    const itemRequired = [
      'id',
      'skillName',
      'direction',
      'action',
      'resourceType',
      'sourcePath',
      'targetPath',
      'sourceHash',
      'linkMode',
      'agent',
      'status',
    ];
    expect([...(schema.properties['items']?.items?.required ?? [])].sort()).toEqual(
      [...itemRequired].sort(),
    );
  });

  it('快照可被前端按 schema 解析', async () => {
    const memory = createMemoryFs({ '/hub/alpha/SKILL.md': '---\nname: alpha\n---\nbody' });
    const plan = await buildSyncPlan(memory.fs, '/hub', []);
    const path = '/home/dev/.manage-skills/plans/plan-1.json';
    await savePlan(memory.fs, path, plan);

    const stored = JSON.parse(memory.files.get(path) ?? '{}') as { plan: unknown };
    expect(validateAgainstSchema(stored.plan)).toEqual([]);

    const loaded = await loadPlan(memory.fs, path);
    expect(loaded.plan).toEqual(plan);
  });
});