import {
  DEFAULT_EVAL_TIMEOUT_MS,
  hasRuleExpectation,
  judgeByRules,
  type EvalCase,
  type EvalCaseSet,
} from './eval-cases.js';
import { historyName } from './history.js';
import { normalizePath } from '../utils/path.js';
import type { HistoryEntry } from '../types/index.js';

export type EvalLabel = 'from' | 'to';

export interface EvalVersionSnapshot {
  hash: string;
  version?: string;
  recordedAt: string;
}

export interface ResolveEvalVersionsOptions {
  path?: string;
  from?: string;
  to?: string;
}

export type ResolveEvalVersionsResult =
  | { ok: true; skillPath: string; from: EvalVersionSnapshot; to: EvalVersionSnapshot }
  | { ok: false; error: string };

function snapshotOf(entry: HistoryEntry): EvalVersionSnapshot {
  return {
    hash: entry.hash,
    ...(entry.version ? { version: entry.version } : {}),
    recordedAt: entry.recordedAt,
  };
}

function availableList(snapshots: EvalVersionSnapshot[]): string {
  return snapshots
    .map((item) => `${item.version ?? '(无版本)'}@${item.hash.slice(0, 8)}`)
    .join(', ');
}

/**
 * 按技能名解析唯一路径与对比版本：
 * - 默认取最近两个内容不同的快照；
 * - 同名多路径必须用 options.path 指定；
 * - from / to 支持版本号或 hash 前缀。
 */
export function resolveEvalVersions(
  entries: HistoryEntry[],
  skill: string,
  options: ResolveEvalVersionsOptions = {},
): ResolveEvalVersionsResult {
  const matching = entries.filter((entry) => historyName(entry) === skill);
  if (matching.length === 0) return { ok: false, error: `没有该技能的历史：${skill}` };

  const paths = [...new Set(matching.map((entry) => entry.path))];
  let skillPath: string;
  if (options.path) {
    const wanted = normalizePath(options.path);
    const found = paths.find((path) => normalizePath(path) === wanted);
    if (!found) {
      return { ok: false, error: `该技能没有此路径的历史：${options.path}` };
    }
    skillPath = found;
  } else if (paths.length > 1) {
    return {
      ok: false,
      error: `技能名对应多个路径，请用 --path 指定：\n${paths.map((path) => `  ${path}`).join('\n')}`,
    };
  } else {
    skillPath = paths[0]!;
  }

  const pathEntries = matching.filter((entry) => entry.path === skillPath);
  const distinct: EvalVersionSnapshot[] = [];
  const seen = new Set<string>();
  for (let index = pathEntries.length - 1; index >= 0; index -= 1) {
    const entry = pathEntries[index]!;
    if (seen.has(entry.hash)) continue;
    seen.add(entry.hash);
    distinct.push(snapshotOf(entry));
  }

  if (distinct.length < 2) {
    return {
      ok: false,
      error: `版本不足：${skill} 只有 ${distinct.length} 个不同内容的版本，至少需要两个`,
    };
  }

  const resolveRef = (ref: string): EvalVersionSnapshot | string => {
    const byVersion = distinct.find((item) => item.version === ref);
    if (byVersion) return byVersion;
    const byHash = distinct.find((item) => item.hash.startsWith(ref));
    if (byHash) return byHash;
    return `无法解析版本引用：${ref}（可用：${availableList(distinct)}）`;
  };

  let from = distinct[1]!;
  if (options.from) {
    const resolved = resolveRef(options.from);
    if (typeof resolved === 'string') return { ok: false, error: resolved };
    from = resolved;
  }

  let to = distinct[0]!;
  if (options.to) {
    const resolved = resolveRef(options.to);
    if (typeof resolved === 'string') return { ok: false, error: resolved };
    to = resolved;
  }

  if (from.hash === to.hash) {
    return { ok: false, error: 'from 与 to 指向同一内容快照，无法对比' };
  }

  return { ok: true, skillPath, from, to };
}

export interface EvalCommandOutput {
  text: string;
  timedOut: boolean;
  durationMs: number;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  exitCode?: number;
  error?: string;
}

export interface EvalJudgeInput {
  prompt: string;
  rubric: string;
  output: string;
}

/** 构造模型裁判提示词：只允许输出 JSON。 */
export function buildJudgePrompt(input: EvalJudgeInput): string {
  return [
    '你在评估一个技能在某条用例上的输出是否满足评分标准。',
    `用例提示：${input.prompt}`,
    `评分标准（rubric）：${input.rubric}`,
    '技能输出：',
    input.output,
    '',
    '只输出 JSON：{"pass": true 或 false, "reason": "简短理由"}',
  ].join('\n');
}

/** 从裁判输出中提取 JSON 判定；无法解析时返回 null。 */
export function parseJudgeVerdict(text: string): { pass: boolean; reason: string } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const data: unknown = JSON.parse(text.slice(start, end + 1));
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
    const record = data as Record<string, unknown>;
    if (typeof record['pass'] !== 'boolean') return null;
    return {
      pass: record['pass'],
      reason: typeof record['reason'] === 'string' ? record['reason'] : '',
    };
  } catch {
    return null;
  }
}

/** 评测运行时：由 CLI 注入（进程执行、临时目录），core 保持平台无关。 */
export interface EvalRuntime {
  createWorkspace(label: EvalLabel, skillName: string, content: string): Promise<string>;
  run(cwd: string, prompt: string, timeoutMs: number): Promise<EvalCommandOutput>;
  judge(input: EvalJudgeInput): Promise<{ pass: boolean; reason: string }>;
  dispose(keep?: boolean): Promise<void>;
}

export interface EvalCaseResult {
  caseId: string;
  label: EvalLabel;
  run: number;
  passed: boolean;
  reason?: string;
  durationMs: number;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  timedOut?: boolean;
  error?: string;
}

export type EvalVerdictKind = 'improved' | 'regressed' | 'no-significant-difference';

export const EVAL_VERDICT_LABELS: Record<EvalVerdictKind, string> = {
  improved: '优化有效',
  regressed: '变差',
  'no-significant-difference': '无显著差异',
};

export interface EvalVersionSummary {
  hash: string;
  version?: string;
  passed: number;
  total: number;
  passRate: number;
  avgCostUsd?: number;
  totalTokens?: number;
}

export interface EvalSummary {
  verdict: EvalVerdictKind;
  verdictLabel: string;
  /** 通过率差值（百分点，目标版本 − 基线版本），保留一位小数 */
  deltaPp: number;
  lowConfidence: boolean;
  from: EvalVersionSummary;
  to: EvalVersionSummary;
}

export interface EvalResult {
  runId: string;
  skill: string;
  skillPath: string;
  from: EvalVersionSnapshot;
  to: EvalVersionSnapshot;
  casesPath: string;
  casesHash: string;
  runs: number;
  startedAt: string;
  finishedAt: string;
  results: EvalCaseResult[];
  summary: EvalSummary;
  warnings: string[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function summarizeVersion(
  results: EvalCaseResult[],
  label: EvalLabel,
  snapshot: EvalVersionSnapshot,
): EvalVersionSummary {
  const list = results.filter((item) => item.label === label);
  const passed = list.filter((item) => item.passed).length;
  const costs = list
    .map((item) => item.costUsd)
    .filter((value): value is number => typeof value === 'number');
  const tokens = list
    .map((item) => (item.inputTokens ?? 0) + (item.outputTokens ?? 0))
    .filter((value) => value > 0);

  return {
    hash: snapshot.hash,
    ...(snapshot.version ? { version: snapshot.version } : {}),
    passed,
    total: list.length,
    passRate: list.length > 0 ? passed / list.length : 0,
    ...(costs.length > 0
      ? { avgCostUsd: costs.reduce((sum, value) => sum + value, 0) / costs.length }
      : {}),
    ...(tokens.length > 0 ? { totalTokens: tokens.reduce((sum, value) => sum + value, 0) } : {}),
  };
}

export function buildEvalSummary(
  results: EvalCaseResult[],
  runs: number,
  from: EvalVersionSnapshot,
  to: EvalVersionSnapshot,
): EvalSummary {
  const fromSummary = summarizeVersion(results, 'from', from);
  const toSummary = summarizeVersion(results, 'to', to);
  const deltaPp = round1((toSummary.passRate - fromSummary.passRate) * 100);
  const verdict: EvalVerdictKind =
    deltaPp >= 10 ? 'improved' : deltaPp <= -10 ? 'regressed' : 'no-significant-difference';

  return {
    verdict,
    verdictLabel: EVAL_VERDICT_LABELS[verdict],
    deltaPp,
    lowConfidence: runs < 2,
    from: fromSummary,
    to: toSummary,
  };
}

async function evaluateCase(
  runtime: EvalRuntime,
  testCase: EvalCase,
  label: EvalLabel,
  run: number,
  output: EvalCommandOutput,
): Promise<EvalCaseResult> {
  const base = {
    caseId: testCase.id,
    label,
    run,
    durationMs: output.durationMs,
    ...(typeof output.costUsd === 'number' ? { costUsd: output.costUsd } : {}),
    ...(typeof output.inputTokens === 'number' ? { inputTokens: output.inputTokens } : {}),
    ...(typeof output.outputTokens === 'number' ? { outputTokens: output.outputTokens } : {}),
  };

  if (output.timedOut) {
    return { ...base, passed: false, timedOut: true, reason: '执行超时' };
  }
  if (output.error || (output.exitCode !== undefined && output.exitCode !== 0)) {
    return {
      ...base,
      passed: false,
      ...(output.exitCode !== undefined ? { exitCode: output.exitCode } : {}),
      reason: output.error ?? `执行失败（退出码 ${output.exitCode}）`,
      error: output.error ?? `exit ${output.exitCode}`,
    };
  }

  if (hasRuleExpectation(testCase.expect)) {
    const verdict = judgeByRules(testCase.expect, output.text);
    return {
      ...base,
      passed: verdict.passed,
      ...(verdict.reason ? { reason: verdict.reason } : {}),
    };
  }

  try {
    const verdict = await runtime.judge({
      prompt: testCase.prompt,
      rubric: testCase.expect.rubric ?? '',
      output: output.text,
    });
    return { ...base, passed: verdict.pass, reason: verdict.reason };
  } catch (error) {
    return {
      ...base,
      passed: false,
      reason: `裁判调用失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export interface RunEvaluationInput {
  skill: string;
  skillPath: string;
  from: EvalVersionSnapshot;
  to: EvalVersionSnapshot;
  fromContent: string;
  toContent: string;
  caseSet: EvalCaseSet;
  runs: number;
  runtime: EvalRuntime;
  keep?: boolean;
  warnings?: string[];
  now?: Date;
  runId?: string;
}

/**
 * 串行执行对比：用例 × 轮次 × 两版本；轮次交替 A/B 顺序。
 * 单条用例超时或执行失败计为未通过，不中断整轮。
 */
export async function runEvaluation(input: RunEvaluationInput): Promise<EvalResult> {
  if (!Number.isInteger(input.runs) || input.runs < 1) {
    throw new Error('--runs 必须是正整数');
  }

  const startedAt = input.now ?? new Date();
  const results: EvalCaseResult[] = [];
  const fromCwd = await input.runtime.createWorkspace('from', input.skill, input.fromContent);
  const toCwd = await input.runtime.createWorkspace('to', input.skill, input.toContent);

  try {
    for (let run = 1; run <= input.runs; run += 1) {
      const order: EvalLabel[] = run % 2 === 1 ? ['from', 'to'] : ['to', 'from'];
      for (const testCase of input.caseSet.cases) {
        for (const label of order) {
          const cwd = label === 'from' ? fromCwd : toCwd;
          const output = await input.runtime.run(
            cwd,
            testCase.prompt,
            testCase.timeoutMs ?? DEFAULT_EVAL_TIMEOUT_MS,
          );
          results.push(await evaluateCase(input.runtime, testCase, label, run, output));
        }
      }
    }
  } finally {
    await input.runtime.dispose(input.keep);
  }

  const finishedAt = new Date();
  return {
    runId: input.runId ?? `eval-${startedAt.getTime().toString(36)}`,
    skill: input.skill,
    skillPath: input.skillPath,
    from: input.from,
    to: input.to,
    casesPath: input.caseSet.path,
    casesHash: input.caseSet.hash,
    runs: input.runs,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    results,
    summary: buildEvalSummary(results, input.runs, input.from, input.to),
    warnings: input.warnings ?? [],
  };
}

export interface EvalVerdictEntry {
  runId: string;
  skill: string;
  verdict: EvalVerdictKind;
  verdictLabel: string;
  deltaPp: number;
  from: EvalVersionSnapshot;
  to: EvalVersionSnapshot;
  at: string;
}

/** 按目标快照 hash 归集最近一次评测结论，供历史视图展示。 */
export function latestEvalVerdicts(results: EvalResult[]): Map<string, EvalVerdictEntry> {
  const sorted = [...results].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  const map = new Map<string, EvalVerdictEntry>();
  for (const result of sorted) {
    map.set(result.to.hash, {
      runId: result.runId,
      skill: result.skill,
      verdict: result.summary.verdict,
      verdictLabel: result.summary.verdictLabel,
      deltaPp: result.summary.deltaPp,
      from: result.from,
      to: result.to,
      at: result.finishedAt,
    });
  }
  return map;
}