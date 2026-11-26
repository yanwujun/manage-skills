import { joinPath } from '../utils/path.js';
import { sha256Hex } from '../utils/sha256.js';
import { utf8Encode } from '../utils/encoding.js';
import type { FileSystemReader } from '../utils/fs.js';

export const EVAL_CASES_DIR = 'evals';
export const EVAL_CASES_FILE = 'cases.json';

export interface EvalCaseExpect {
  contains?: string[];
  notContains?: string[];
  regex?: string;
  rubric?: string;
}

export interface EvalCase {
  id: string;
  prompt: string;
  expect: EvalCaseExpect;
  timeoutMs?: number;
}

export interface EvalCaseSet {
  path: string;
  hash: string;
  cases: EvalCase[];
}

export interface LoadEvalCasesResult {
  set?: EvalCaseSet;
  error?: string;
}

export const DEFAULT_EVAL_TIMEOUT_MS = 120_000;

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function parseExpect(value: unknown): EvalCaseExpect | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'expect 必须是对象';
  }
  const data = value as Record<string, unknown>;
  const expect: EvalCaseExpect = {};

  if (data['contains'] !== undefined) {
    const list = stringList(data['contains']);
    if (!list) return 'expect.contains 必须是非空字符串数组';
    expect.contains = list;
  }
  if (data['notContains'] !== undefined) {
    const list = stringList(data['notContains']);
    if (!list) return 'expect.notContains 必须是非空字符串数组';
    expect.notContains = list;
  }
  if (data['regex'] !== undefined) {
    if (typeof data['regex'] !== 'string' || !data['regex']) return 'expect.regex 必须是非空字符串';
    try {
      new RegExp(data['regex']);
    } catch {
      return `expect.regex 不是合法正则：${data['regex']}`;
    }
    expect.regex = data['regex'];
  }
  if (data['rubric'] !== undefined) {
    if (typeof data['rubric'] !== 'string' || !data['rubric'].trim()) {
      return 'expect.rubric 必须是非空字符串';
    }
    expect.rubric = data['rubric'].trim();
  }

  if (!hasRuleExpectation(expect) && !expect.rubric) {
    return 'expect 至少需要 contains / notContains / regex / rubric 之一';
  }
  return expect;
}

function parseCase(value: unknown, index: number): EvalCase | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return `第 ${index + 1} 条用例必须是对象`;
  }
  const data = value as Record<string, unknown>;
  const id = typeof data['id'] === 'string' ? data['id'].trim() : '';
  if (!id) return `第 ${index + 1} 条用例缺少 id`;
  const prompt = typeof data['prompt'] === 'string' ? data['prompt'].trim() : '';
  if (!prompt) return `用例 ${id} 缺少 prompt`;

  const expect = parseExpect(data['expect']);
  if (typeof expect === 'string') return `用例 ${id}：${expect}`;

  let timeoutMs: number | undefined;
  if (data['timeoutMs'] !== undefined) {
    const value = data['timeoutMs'];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return `用例 ${id}：timeoutMs 必须是正数`;
    }
    timeoutMs = value;
  }

  return { id, prompt, expect, ...(timeoutMs ? { timeoutMs } : {}) };
}

/** 读取并校验技能目录下的 `evals/cases.json`，同时计算文件内容 hash。 */
export async function loadEvalCases(
  fs: FileSystemReader,
  skillDir: string,
): Promise<LoadEvalCasesResult> {
  const path = joinPath(skillDir, EVAL_CASES_DIR, EVAL_CASES_FILE);
  const stat = await fs.stat(path);
  if (!stat || !stat.isFile) {
    return { error: `未找到评测用例：${path}（需要 evals/cases.json）` };
  }

  let raw: string;
  try {
    raw = await fs.readTextFile(path);
  } catch (error) {
    return { error: `用例文件读取失败：${error instanceof Error ? error.message : String(error)}` };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    return { error: `用例文件不是合法 JSON：${error instanceof Error ? error.message : String(error)}` };
  }

  const list = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && Array.isArray((data as Record<string, unknown>)['cases'])
      ? ((data as Record<string, unknown>)['cases'] as unknown[])
      : null;
  if (!list) return { error: '用例文件应为数组，或包含 cases 数组的对象' };
  if (list.length === 0) return { error: '用例集为空' };

  const cases: EvalCase[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < list.length; index += 1) {
    const parsed = parseCase(list[index], index);
    if (typeof parsed === 'string') return { error: parsed };
    if (seen.has(parsed.id)) return { error: `用例 id 重复：${parsed.id}` };
    seen.add(parsed.id);
    cases.push(parsed);
  }

  return {
    set: { path, hash: sha256Hex(utf8Encode(raw)), cases },
  };
}

/** 是否存在可规则化判定的条件（有任意一条就不调用模型裁判）。 */
export function hasRuleExpectation(expect: EvalCaseExpect): boolean {
  return Boolean(expect.contains || expect.notContains || expect.regex);
}

export interface RuleVerdict {
  passed: boolean;
  reason?: string;
}

/** 规则判定：contains 全部满足、notContains 全部不满足、regex 匹配。 */
export function judgeByRules(expect: EvalCaseExpect, text: string): RuleVerdict {
  for (const needle of expect.contains ?? []) {
    if (!text.includes(needle)) return { passed: false, reason: `输出缺少必需内容：${needle}` };
  }
  for (const needle of expect.notContains ?? []) {
    if (text.includes(needle)) return { passed: false, reason: `输出包含禁止内容：${needle}` };
  }
  if (expect.regex && !new RegExp(expect.regex).test(text)) {
    return { passed: false, reason: `输出不匹配正则：${expect.regex}` };
  }
  return { passed: true };
}