import { parseSkillFile } from './frontmatter.js';
import { sha256Hex } from '../utils/sha256.js';
import { utf8Encode } from '../utils/encoding.js';
import type { FileSystemReader } from '../utils/fs.js';
import type { SkillRecord } from '../types/index.js';

export interface SimilarityOptions {
  /** 高置信阈值（默认 0.8） */
  highThreshold?: number;
  /** 展示阈值（默认 0.6） */
  showThreshold?: number;
  /** 描述特征的权重倍数（默认 2） */
  descriptionWeight?: number;
  /** 单技能特征上限（默认 512） */
  maxFeatures?: number;
  /** 忽略的无序对（a,b 已排序的键） */
  ignoredPairs?: Iterable<string>;
  /** 缓存文件路径；提供时命中新鲜缓存则跳过计算 */
  cachePath?: string;
}

export interface SimilarityPair {
  a: string;
  b: string;
  score: number;
  descriptionScore: number;
  bodyScore: number;
}

export interface SimilarityGroup {
  id: string;
  members: string[];
  score: number;
  /** 组内并非全部两两相似 */
  chained: boolean;
  pairs: SimilarityPair[];
}

export interface SimilarityResult {
  groups: SimilarityGroup[];
  highConfidence: SimilarityGroup[];
  cached: boolean;
}

const CJK = /[一-鿿]/;
const CJK_RUN = /[一-鿿]+/g;
const MAX_FEATURE_SCAN = 4000;
const MINHASH_PERMUTATIONS = 64;
const LSH_BANDS = 16;
const LSH_ROWS = 4;

/** 去掉 frontmatter，只保留正文。 */
export function extractBody(content: string): string {
  return parseSkillFile(content).body;
}

/** 归一化：去代码块、URL、标点，统一小写。 */
export function normalizeText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .toLowerCase()
    .trim();
}

/** 特征：英文按词（长度 ≥3），中文按字符 3-gram。 */
export function extractFeatures(text: string): Set<string> {
  const features = new Set<string>();
  const words = text.split(/\s+/).filter((word) => word.length >= 3 && !CJK.test(word));
  for (const word of words) {
    features.add(`w:${word}`);
    if (features.size >= MAX_FEATURE_SCAN) return features;
  }

  const runs = text.match(CJK_RUN) ?? [];
  for (const run of runs) {
    if (run.length < 3) {
      features.add(`c:${run}`);
      continue;
    }
    for (let i = 0; i <= run.length - 3; i += 1) {
      features.add(`c:${run.slice(i, i + 3)}`);
      if (features.size >= MAX_FEATURE_SCAN) return features;
    }
  }
  return features;
}

function weightedSet(text: string, weight: number, cap: number): Map<string, number> {
  const map = new Map<string, number>();
  for (const feature of extractFeatures(text)) {
    if (map.size >= cap) break;
    map.set(feature, weight);
  }
  return map;
}

/** 加权 Jaccard：Σmin / Σmax。 */
export function weightedJaccard(a: Map<string, number>, b: Map<string, number>): number {
  let min = 0;
  let max = 0;
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    const left = a.get(key) ?? 0;
    const right = b.get(key) ?? 0;
    min += Math.min(left, right);
    max += Math.max(left, right);
  }
  return max === 0 ? 0 : min / max;
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const SEEDS = Array.from({ length: MINHASH_PERMUTATIONS }, (_, index) =>
  fnv1a(`seed:${index}`),
);

export function minhashSignature(features: Map<string, number>): Uint32Array {
  const signature = new Uint32Array(MINHASH_PERMUTATIONS).fill(0xffffffff);
  for (const term of features.keys()) {
    for (let i = 0; i < MINHASH_PERMUTATIONS; i += 1) {
      const hash = fnv1a(`${SEEDS[i]}:${term}`);
      if (hash < signature[i]!) signature[i] = hash;
    }
  }
  return signature;
}

/** LSH 分桶键：用于把签名切成 band 段做候选筛选。 */
export function lshBuckets(signature: Uint32Array): string[] {
  const buckets: string[] = [];
  for (let band = 0; band < LSH_BANDS; band += 1) {
    const parts: string[] = [];
    for (let row = 0; row < LSH_ROWS; row += 1) {
      parts.push(String(signature[band * LSH_ROWS + row] ?? 0));
    }
    buckets.push(`${band}:${parts.join(',')}`);
  }
  return buckets;
}

interface Prepared {
  id: string;
  description: Map<string, number>;
  body: Map<string, number>;
  combined: Map<string, number>;
  buckets: string[];
}

async function prepare(
  fs: FileSystemReader,
  record: SkillRecord,
  options: Required<Pick<SimilarityOptions, 'descriptionWeight' | 'maxFeatures'>>,
): Promise<Prepared | null> {
  if (record.stale) return null;
  let content: string;
  try {
    content = await fs.readTextFile(record.path);
  } catch {
    return null;
  }
  const bodyText = normalizeText(extractBody(content));
  const descriptionText = normalizeText(record.frontmatter.description ?? '');

  const description = weightedSet(descriptionText, options.descriptionWeight, options.maxFeatures);
  const body = weightedSet(bodyText, 1, options.maxFeatures);
  const combined = new Map(body);
  for (const [key, value] of description) {
    combined.set(key, (combined.get(key) ?? 0) + value);
  }

  return {
    id: record.path,
    description,
    body,
    combined,
    buckets: lshBuckets(minhashSignature(combined)),
  };
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface UnionFind {
  find: (value: string) => string;
  union: (a: string, b: string) => void;
}

function createUnionFind(): UnionFind {
  const parent = new Map<string, string>();
  const find = (value: string): string => {
    const current = parent.get(value) ?? value;
    if (current === value) {
      parent.set(value, value);
      return value;
    }
    const root = find(current);
    parent.set(value, root);
    return root;
  };
  return {
    find,
    union(a, b) {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parent.set(rootB, rootA);
    },
  };
}

function buildGroups(pairs: SimilarityPair[], threshold: number): SimilarityGroup[] {
  const uf = createUnionFind();
  for (const pair of pairs) {
    if (pair.score >= threshold) uf.union(pair.a, pair.b);
  }

  const byRoot = new Map<string, SimilarityPair[]>();
  for (const pair of pairs) {
    if (pair.score < threshold) continue;
    const root = uf.find(pair.a);
    const list = byRoot.get(root);
    if (list) list.push(pair);
    else byRoot.set(root, [pair]);
  }

  const groups: SimilarityGroup[] = [];
  for (const [root, groupPairs] of byRoot) {
    const members = [...new Set(groupPairs.flatMap((pair) => [pair.a, pair.b]))].sort();
    if (members.length < 2) continue;

    const pairScores = new Map(groupPairs.map((pair) => [pairKey(pair.a, pair.b), pair.score]));
    let chained = false;
    for (let i = 0; i < members.length && !chained; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        if ((pairScores.get(pairKey(members[i]!, members[j]!)) ?? 0) < threshold) {
          chained = true;
          break;
        }
      }
    }

    groups.push({
      id: `group:${root}`,
      members,
      score: groupPairs.reduce((max, pair) => Math.max(max, pair.score), 0),
      chained,
      pairs: groupPairs.sort((a, b) => b.score - a.score),
    });
  }

  return groups.sort((a, b) => b.score - a.score);
}

/** 所有技能的 path + hash 摘要，用于缓存失效判断。 */
export function sourceDigest(records: SkillRecord[]): string {
  const parts = records
    .filter((record) => !record.stale)
    .map((record) => `${record.path}:${record.hash}`)
    .sort();
  return sha256Hex(utf8Encode(parts.join('\n')));
}

export interface SimilarityCache {
  schemaVersion: 1;
  sourceDigest: string;
  generatedAt: string;
  groups: SimilarityGroup[];
}

export async function loadSimilarityCache(
  fs: FileSystemReader,
  path: string,
): Promise<SimilarityCache | null> {
  try {
    const stat = await fs.stat(path);
    if (!stat?.isFile) return null;
    const data = JSON.parse(await fs.readTextFile(path)) as SimilarityCache;
    return data.schemaVersion === 1 ? data : null;
  } catch {
    return null;
  }
}

export async function saveSimilarityCache(
  fs: import('../utils/fs.js').FileSystem,
  path: string,
  cache: SimilarityCache,
): Promise<void> {
  await fs.mkdirp(path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))));
  await fs.writeTextFileAtomic(path, `${JSON.stringify(cache, null, 2)}\n`);
}

/**
 * 计算技能相似组：
 * 归一化 → 特征 → MinHash/LSH 候选 → 加权 Jaccard 精算 → 并查集分组。
 * 只返回不低于展示阈值的关系。
 */
export async function computeSimilarity(
  fs: FileSystemReader,
  records: SkillRecord[],
  options: SimilarityOptions = {},
): Promise<SimilarityResult> {
  const highThreshold = options.highThreshold ?? 0.8;
  const showThreshold = options.showThreshold ?? 0.6;
  const descriptionWeight = options.descriptionWeight ?? 2;
  const maxFeatures = options.maxFeatures ?? 512;
  const ignored = new Set(options.ignoredPairs ?? []);

  const digest = sourceDigest(records);
  if (options.cachePath) {
    const cache = await loadSimilarityCache(fs, options.cachePath);
    if (cache && cache.sourceDigest === digest) {
      return {
        groups: cache.groups,
        highConfidence: cache.groups.filter((group) => group.score >= highThreshold),
        cached: true,
      };
    }
  }

  const prepared: Prepared[] = [];
  for (const record of records) {
    const item = await prepare(fs, record, { descriptionWeight, maxFeatures });
    if (item) prepared.push(item);
  }

  // LSH 候选
  const buckets = new Map<string, number[]>();
  prepared.forEach((item, index) => {
    for (const bucket of item.buckets) {
      const list = buckets.get(bucket);
      if (list) list.push(index);
      else buckets.set(bucket, [index]);
    }
  });

  const candidatePairs = new Set<string>();
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i]!;
        const b = list[j]!;
        candidatePairs.add(a < b ? `${a}:${b}` : `${b}:${a}`);
      }
    }
  }

  const pairs: SimilarityPair[] = [];
  for (const key of candidatePairs) {
    const [aIndex, bIndex] = key.split(':').map(Number) as [number, number];
    const a = prepared[aIndex];
    const b = prepared[bIndex];
    if (!a || !b) continue;
    if (ignored.has(pairKey(a.id, b.id))) continue;

    const score = weightedJaccard(a.combined, b.combined);
    if (score < showThreshold) continue;

    pairs.push({
      a: a.id,
      b: b.id,
      score,
      descriptionScore: weightedJaccard(a.description, b.description),
      bodyScore: weightedJaccard(a.body, b.body),
    });
  }

  const groups = buildGroups(pairs, showThreshold);
  return {
    groups,
    highConfidence: groups.filter((group) => group.score >= highThreshold),
    cached: false,
  };
}