import { describe, expect, it } from 'vitest';
import {
  computeSimilarity,
  extractBody,
  extractFeatures,
  lshBuckets,
  minhashSignature,
  normalizeText,
  saveSimilarityCache,
  sha256Hex,
  sourceDigest,
  utf8Encode,
  weightedJaccard,
  type SkillRecord,
} from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';

const X1 = '合同履约供应商评估采购目录质量控制规范要求';
const X2 = '风险预警合规审计数据分析报表统计方法流程';
const X3 = '前端界面设计交互体验响应式布局组件样式';

function record(path: string, body: string, description = ''): SkillRecord {
  return {
    id: `agent:${path}`,
    instanceId: 'claude',
    agent: 'claude-code',
    root: '/skills',
    path,
    relativePath: path.replace(/^\//, ''),
    hash: sha256Hex(utf8Encode(body)),
    size: body.length,
    mtimeMs: 1000,
    frontmatter: { name: path.replace(/^\//, ''), ...(description ? { description } : {}) },
    status: 'ok',
  };
}

function skillFile(body: string, description = ''): string {
  return `---\nname: x\n${description ? `description: ${description}\n` : ''}---\n\n${body}`;
}

describe('归一化与特征', () => {
  it('去掉 frontmatter、代码块、URL 与标点', () => {
    const content = skillFile('正文 内容 https://example.com 测试', '描述');
    const body = extractBody(content);
    const normalized = normalizeText(body);
    expect(normalized).not.toContain('example');
    expect(normalized).toContain('正文');
    expect(normalized).toContain('内容');
    expect(normalized).not.toMatch(/[，。!]/);
  });

  it('代码块被排除', () => {
    const text = normalizeText('说明文字\n```js\nconst secret = 1;\n```\n结尾');
    expect(text).not.toContain('const');
    expect(text).toContain('说明文字');
  });

  it('中英文混合产出非空特征', () => {
    const features = extractFeatures(normalizeText('PDF toolkit 合并文档'));
    expect(features.size).toBeGreaterThan(0);
    expect([...features].some((feature) => feature.startsWith('w:'))).toBe(true);
    expect([...features].some((feature) => feature.startsWith('c:'))).toBe(true);
  });

  it('中文按 3-gram 切分', () => {
    const features = extractFeatures('合同履约供应商');
    expect(features.has('c:合同履')).toBe(true);
    expect(features.has('c:同履约')).toBe(true);
  });

  it('加权 Jaccard 计算', () => {
    const a = new Map([
      ['x', 2],
      ['y', 1],
    ]);
    const b = new Map([
      ['x', 2],
      ['z', 1],
    ]);
    expect(weightedJaccard(a, b)).toBeCloseTo(2 / 4, 5);
  });
});

describe('LSH 候选', () => {
  it('同桶对显著少于全量两两组合', () => {
    const signatures = Array.from({ length: 30 }, (_, index) =>
      minhashSignature(
        new Map([[`w:skill${index}a`, 1], [`w:skill${index}b`, 1], ['w:shared', 1]]),
      ),
    );

    const buckets = new Map<string, number[]>();
    signatures.forEach((signature, index) => {
      for (const bucket of lshBuckets(signature)) {
        const list = buckets.get(bucket);
        if (list) list.push(index);
        else buckets.set(bucket, [index]);
      }
    });

    const pairs = new Set<string>();
    for (const list of buckets.values()) {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          pairs.add(`${list[i]}:${list[j]}`);
        }
      }
    }

    const all = (signatures.length * (signatures.length - 1)) / 2;
    expect(pairs.size).toBeLessThan(all / 4);
  });
});

describe('相似组检测', () => {
  it('近似副本归入高置信组', async () => {
    const memory = createMemoryFs({
      '/a/SKILL.md': skillFile(`${X1} ${X2}`),
      '/b/SKILL.md': skillFile(`${X1} ${X2} 补充`),
      '/c/SKILL.md': skillFile(X3),
    });
    const records = [record('/a/SKILL.md', X1), record('/b/SKILL.md', X1), record('/c/SKILL.md', X3)];
    const result = await computeSimilarity(memory.fs, records);

    expect(result.groups).toHaveLength(1);
    expect(result.highConfidence).toHaveLength(1);
    expect(result.groups[0]?.members).toEqual(['/a/SKILL.md', '/b/SKILL.md']);
  });

  it('链式相似标记 chained', async () => {
    const memory = createMemoryFs({
      '/a/SKILL.md': skillFile(`${X1} ${X2}`),
      '/b/SKILL.md': skillFile(`${X1} ${X2} ${X3}`),
      '/c/SKILL.md': skillFile(`${X2} ${X3}`),
    });
    const records = [
      record('/a/SKILL.md', X1),
      record('/b/SKILL.md', X2),
      record('/c/SKILL.md', X3),
    ];
    const result = await computeSimilarity(memory.fs, records, { showThreshold: 0.6 });

    const group = result.groups[0];
    expect(group?.members).toHaveLength(3);
    expect(group?.chained).toBe(true);
  });

  it('忽略规则过滤指定对', async () => {
    const memory = createMemoryFs({
      '/a/SKILL.md': skillFile(`${X1} ${X2}`),
      '/b/SKILL.md': skillFile(`${X1} ${X2} 补充`),
    });
    const records = [record('/a/SKILL.md', X1), record('/b/SKILL.md', X1)];
    const key = '/a/SKILL.md|/b/SKILL.md';

    const withIgnore = await computeSimilarity(memory.fs, records, { ignoredPairs: [key] });
    expect(withIgnore.groups).toHaveLength(0);

    const withoutIgnore = await computeSimilarity(memory.fs, records);
    expect(withoutIgnore.groups).toHaveLength(1);
  });

  it('阈值可配置', async () => {
    const memory = createMemoryFs({
      '/a/SKILL.md': skillFile(`${X1} ${X2}`),
      '/b/SKILL.md': skillFile(`${X1} ${X2} 补充`),
    });
    const records = [record('/a/SKILL.md', X1), record('/b/SKILL.md', X1)];
    const high = await computeSimilarity(memory.fs, records, { highThreshold: 0.99 });
    expect(high.highConfidence).toHaveLength(0);
    expect(high.groups).toHaveLength(1);
  });
});

describe('缓存', () => {
  it('命中新鲜缓存时跳过计算', async () => {
    const memory = createMemoryFs({
      '/a/SKILL.md': skillFile(X1),
      '/b/SKILL.md': skillFile(`${X1} 补充`),
    });
    const records = [record('/a/SKILL.md', X1), record('/b/SKILL.md', X1)];
    const cachePath = '/cache/similarity.json';

    const first = await computeSimilarity(memory.fs, records, { cachePath });
    expect(first.cached).toBe(false);

    // 手动写入缓存模拟持久化
    await saveSimilarityCache(memory.fs, cachePath, {
      schemaVersion: 1,
      sourceDigest: sourceDigest(records),
      generatedAt: new Date().toISOString(),
      groups: first.groups,
    });

    const second = await computeSimilarity(memory.fs, records, { cachePath });
    expect(second.cached).toBe(true);

    const changed = records.map((item) => ({ ...item, hash: 'changed' }));
    const third = await computeSimilarity(memory.fs, changed, { cachePath });
    expect(third.cached).toBe(false);
  });
});

describe('性能基准', () => {
  it('500 份技能计算在 5 秒内完成', async () => {
    const files: Record<string, string> = {};
    const records: SkillRecord[] = [];

    // 每组 10 份同主题技能，组间主题完全不同（模拟真实库的分组分布）
    const groupBody = (group: number): string => {
      const chars = Array.from({ length: 240 }, (_, index) =>
        String.fromCharCode(0x4e00 + ((group * 97 + index * 13) % 2000)),
      );
      return chars.join('');
    };

    for (let index = 0; index < 500; index += 1) {
      const path = `/${index}/SKILL.md`;
      const body = groupBody(Math.floor(index / 10));
      files[path] = skillFile(body);
      records.push(record(path, body));
    }

    const memory = createMemoryFs(files);
    const started = performance.now();
    const result = await computeSimilarity(memory.fs, records);
    const elapsed = performance.now() - started;

    console.log(`[bench] 500 份相似度计算耗时 ${elapsed.toFixed(0)}ms，组数 ${result.groups.length}`);
    expect(elapsed).toBeLessThan(5000);
  }, 60_000);
});