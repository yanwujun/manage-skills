import { promises as fsp } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildAuditReport,
  computeSimilarity,
  effectiveTags,
  filterByTags,
  saveTags,
  scanInstances,
  type ManageSkillsIndex,
  type SkillRecord,
} from '../src/index.js';
import { createNodeFs } from './helpers/node-fs.js';

const X1 = '合同履约供应商评估采购目录质量控制规范要求';
const X2 = '风险预警合规审计数据分析报表统计方法流程';
const X3 = '前端界面设计交互体验响应式布局组件样式';

const skill = (name: string, body: string): string =>
  `---\nname: ${name}\ndescription: 文档处理\n---\n\n${body}\n`;

let root = '';
let fs: ReturnType<typeof createNodeFs>;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'manage-skills-tag-e2e-'));
  fs = createNodeFs();
  for (const [dir, name, body] of [
    ['alpha', 'alpha', `${X1} ${X2}`],
    ['alpha-v2', 'alpha-v2', `${X1} ${X2} 补充`],
    ['gamma', 'gamma', X3],
  ] as const) {
    await fsp.mkdir(join(root, dir), { recursive: true });
    await fsp.writeFile(join(root, dir, 'SKILL.md'), skill(name, body), 'utf8');
  }
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('标签与相似度端到端', () => {
  it('打标 → 筛选 → 相似组 → 忽略 → 撤销 → 审计', async () => {
    const records: SkillRecord[] = await scanInstances(fs, [
      { id: 'e2e', agent: 'claude-code', root, scope: 'global', os: 'linux' },
    ]);
    expect(records).toHaveLength(3);

    // 1. 批量打标（只写 sidecar）
    const indexPath = join(root, '.manage-skills', 'index.json');
    const index: ManageSkillsIndex = {
      schemaVersion: 2,
      generatedAt: '',
      skills: records,
    };
    const tagged = await saveTags(fs, indexPath, index, records.map((item) => item.path), {
      add: ['Docs'],
    });
    expect(tagged.skills.every((item) => effectiveTags(item).includes('docs'))).toBe(true);
    expect(filterByTags(tagged.skills, ['docs'])).toHaveLength(3);

    // 2. 相似组检出（alpha 与 alpha-v2 为改名 + 微调副本）
    const similarity = await computeSimilarity(fs, records);
    expect(similarity.groups).toHaveLength(1);
    const group = similarity.groups[0]!;
    expect(group.members.map((path) => path.split(/[\\/]/).slice(-2, -1)[0]).sort()).toEqual([
      'alpha',
      'alpha-v2',
    ]);
    expect(group.score).toBeGreaterThanOrEqual(0.8);

    // 3. 忽略后该组消失，撤销后恢复
    const pairKey = [group.members[0]!, group.members[1]!].sort().join('|');
    const ignored = await computeSimilarity(fs, records, { ignoredPairs: [pairKey] });
    expect(ignored.groups).toHaveLength(0);
    const restored = await computeSimilarity(fs, records);
    expect(restored.groups).toHaveLength(1);

    // 4. 审计报告包含 similar 且不含正文
    const report = await buildAuditReport(tagged.skills, {
      similarityGroups: similarity.highConfidence,
    });
    expect(report.counts.similar).toBe(1);

    // 5. 源文件未被修改
    const alphaContent = await fsp.readFile(join(root, 'alpha', 'SKILL.md'), 'utf8');
    expect(alphaContent).toContain(X1);
  });
});