import { describe, expect, it } from 'vitest';
import {
  buildEvalSummary,
  buildJudgePrompt,
  judgeByRules,
  latestEvalVerdicts,
  loadEvalCases,
  loadEvalResults,
  parseJudgeVerdict,
  resolveEvalRunner,
  resolveEvalVersions,
  runEvaluation,
  saveEvalResult,
  type EvalCaseSet,
  type EvalCaseResult,
  type EvalCommandOutput,
  type EvalResult,
  type EvalRuntime,
  type EvalVersionSnapshot,
  type HistoryEntry,
} from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';

const SKILL_DIR = '/home/dev/.claude/skills/foo';
const CASES_PATH = `${SKILL_DIR}/evals/cases.json`;

function history(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    path: `${SKILL_DIR}/SKILL.md`,
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

function snapshot(hash: string, version?: string): EvalVersionSnapshot {
  return { hash, recordedAt: '2026-11-25T00:00:00.000Z', ...(version ? { version } : {}) };
}

function caseSet(cases: EvalCaseSet['cases']): EvalCaseSet {
  return { path: CASES_PATH, hash: 'cases-hash', cases };
}

describe('resolveEvalRunner', () => {
  it('缺省使用 claude 非交互 JSON 输出', () => {
    expect(resolveEvalRunner()).toEqual({
      command: 'claude',
      args: ['-p', '--output-format', 'json'],
    });
  });

  it('可覆盖命令与参数', () => {
    expect(resolveEvalRunner({ command: 'fake', args: ['--x'] })).toEqual({
      command: 'fake',
      args: ['--x'],
    });
  });

  it('非法字段报错并指出字段名', () => {
    expect(() => resolveEvalRunner({ command: '  ' })).toThrow('evalRunner.command');
    expect(() => resolveEvalRunner({ args: [1 as unknown as string] })).toThrow('evalRunner.args');
  });
});

describe('loadEvalCases', () => {
  const valid = JSON.stringify([
    { id: 'a', prompt: 'do a', expect: { contains: ['ok'] } },
  ]);

  it('读取数组形式并计算 hash', async () => {
    const memory = createMemoryFs({ [CASES_PATH]: valid });
    const result = await loadEvalCases(memory.fs, SKILL_DIR);
    expect(result.error).toBeUndefined();
    expect(result.set?.cases).toHaveLength(1);
    expect(result.set?.hash).toHaveLength(64);
  });

  it('支持 { cases: [...] } 形式', async () => {
    const memory = createMemoryFs({ [CASES_PATH]: JSON.stringify({ cases: JSON.parse(valid) }) });
    const result = await loadEvalCases(memory.fs, SKILL_DIR);
    expect(result.set?.cases[0]?.id).toBe('a');
  });

  it('内容变化后 hash 改变', async () => {
    const memory = createMemoryFs({ [CASES_PATH]: valid });
    const first = await loadEvalCases(memory.fs, SKILL_DIR);
    memory.files.set(CASES_PATH, valid.replace('do a', 'do b'));
    const second = await loadEvalCases(memory.fs, SKILL_DIR);
    expect(first.set?.hash).not.toBe(second.set?.hash);
  });

  it('缺失文件给出明确路径', async () => {
    const memory = createMemoryFs();
    const result = await loadEvalCases(memory.fs, SKILL_DIR);
    expect(result.error).toContain('未找到评测用例');
    expect(result.error).toContain(CASES_PATH);
  });

  it('非法 JSON 报错', async () => {
    const memory = createMemoryFs({ [CASES_PATH]: '{bad' });
    expect((await loadEvalCases(memory.fs, SKILL_DIR)).error).toContain('不是合法 JSON');
  });

  it('缺 id / prompt 报错', async () => {
    const missingId = createMemoryFs({
      [CASES_PATH]: JSON.stringify([{ prompt: 'x', expect: { contains: ['a'] } }]),
    });
    expect((await loadEvalCases(missingId.fs, SKILL_DIR)).error).toContain('缺少 id');

    const missingPrompt = createMemoryFs({
      [CASES_PATH]: JSON.stringify([{ id: 'x', expect: { contains: ['a'] } }]),
    });
    expect((await loadEvalCases(missingPrompt.fs, SKILL_DIR)).error).toContain('缺少 prompt');
  });

  it('重复 id 报错', async () => {
    const memory = createMemoryFs({
      [CASES_PATH]: JSON.stringify([
        { id: 'x', prompt: 'a', expect: { contains: ['a'] } },
        { id: 'x', prompt: 'b', expect: { contains: ['b'] } },
      ]),
    });
    expect((await loadEvalCases(memory.fs, SKILL_DIR)).error).toContain('用例 id 重复');
  });

  it('缺少判定条件或非法正则报错', async () => {
    const emptyExpect = createMemoryFs({
      [CASES_PATH]: JSON.stringify([{ id: 'x', prompt: 'a', expect: {} }]),
    });
    expect((await loadEvalCases(emptyExpect.fs, SKILL_DIR)).error).toContain('至少需要');

    const badRegex = createMemoryFs({
      [CASES_PATH]: JSON.stringify([{ id: 'x', prompt: 'a', expect: { regex: '(' } }]),
    });
    expect((await loadEvalCases(badRegex.fs, SKILL_DIR)).error).toContain('不是合法正则');
  });

  it('空集合报错', async () => {
    const memory = createMemoryFs({ [CASES_PATH]: '[]' });
    expect((await loadEvalCases(memory.fs, SKILL_DIR)).error).toContain('用例集为空');
  });
});

describe('judgeByRules', () => {
  it('全部满足时通过', () => {
    expect(judgeByRules({ contains: ['a', 'b'], notContains: ['c'], regex: '^ab' }, 'abc')).toEqual({
      passed: false,
      reason: '输出包含禁止内容：c',
    });
    expect(judgeByRules({ contains: ['a'], regex: '^ab' }, 'abc')).toEqual({ passed: true });
  });

  it('缺少必需内容失败', () => {
    expect(judgeByRules({ contains: ['z'] }, 'abc').passed).toBe(false);
  });

  it('正则不匹配失败', () => {
    expect(judgeByRules({ regex: '^z' }, 'abc').passed).toBe(false);
  });
});

describe('resolveEvalVersions', () => {
  const entries = [
    history({ hash: 'h1', version: '1.0.0', recordedAt: '2026-01-01T00:00:00.000Z' }),
    history({ hash: 'h2', version: '1.0.0', recordedAt: '2026-01-02T00:00:00.000Z' }),
    history({ hash: 'h3', version: '1.0.1', recordedAt: '2026-01-03T00:00:00.000Z' }),
  ];

  it('默认取最近两个不同内容快照', () => {
    const result = resolveEvalVersions(entries, 'foo');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.from.hash).toBe('h2');
      expect(result.to.hash).toBe('h3');
    }
  });

  it('支持版本号与 hash 前缀', () => {
    const byVersion = resolveEvalVersions(entries, 'foo', { from: '1.0.0', to: '1.0.1' });
    expect(byVersion.ok && byVersion.from.hash).toBe('h2');

    const byHash = resolveEvalVersions(entries, 'foo', { from: 'h1', to: 'h2' });
    expect(byHash.ok && byHash.from.hash).toBe('h1');
  });

  it('无法解析引用时列出可用版本', () => {
    const result = resolveEvalVersions(entries, 'foo', { from: 'nope' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('无法解析版本引用');
      expect(result.error).toContain('1.0.0');
    }
  });

  it('版本不足报错', () => {
    const result = resolveEvalVersions([history()], 'foo');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('版本不足');
  });

  it('同名多路径要求 --path', () => {
    const multi = [
      ...entries,
      history({ path: '/other/foo/SKILL.md', hash: 'x1' }),
    ];
    const ambiguous = resolveEvalVersions(multi, 'foo');
    expect(ambiguous.ok).toBe(false);
    if (!ambiguous.ok) expect(ambiguous.error).toContain('多个路径');

    const chosen = resolveEvalVersions(multi, 'foo', { path: '/other/foo/SKILL.md' });
    expect(chosen.ok).toBe(false); // 该路径只有一个版本
    if (!chosen.ok) expect(chosen.error).toContain('版本不足');
  });

  it('from 与 to 相同报错', () => {
    const result = resolveEvalVersions(entries, 'foo', { from: 'h3', to: 'h3' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('同一内容快照');
  });
});

interface FakeRuntimeOptions {
  output?: (prompt: string) => EvalCommandOutput;
  judge?: () => Promise<{ pass: boolean; reason: string }>;
}

function createFakeRuntime(options: FakeRuntimeOptions = {}): {
  runtime: EvalRuntime;
  calls: Array<{ label: string; cwd: string; prompt: string }>;
  workspaces: Array<{ label: string; name: string; content: string }>;
  disposed: Array<boolean | undefined>;
} {
  const calls: Array<{ label: string; cwd: string; prompt: string }> = [];
  const workspaces: Array<{ label: string; name: string; content: string }> = [];
  const disposed: Array<boolean | undefined> = [];

  const runtime: EvalRuntime = {
    async createWorkspace(label, name, content) {
      workspaces.push({ label, name, content });
      return `/tmp/${label}`;
    },
    async run(cwd, prompt) {
      calls.push({ label: cwd.endsWith('from') ? 'from' : 'to', cwd, prompt });
      return (
        options.output?.(prompt) ?? {
          text: 'ok',
          timedOut: false,
          durationMs: 5,
          costUsd: 0.01,
          inputTokens: 2,
          outputTokens: 3,
        }
      );
    },
    async judge() {
      return options.judge ? options.judge() : { pass: true, reason: 'good' };
    },
    async dispose(keep) {
      disposed.push(keep);
    },
  };

  return { runtime, calls, workspaces, disposed };
}

describe('runEvaluation', () => {
  const cases = caseSet([
    { id: 'a', prompt: 'do a', expect: { contains: ['ok'] } },
    { id: 'b', prompt: 'do b', expect: { contains: ['ok'] } },
  ]);

  it('调用数为用例 × 轮次 × 2，且按轮次交替顺序', async () => {
    const fake = createFakeRuntime();
    const result = await runEvaluation({
      skill: 'foo',
      skillPath: `${SKILL_DIR}/SKILL.md`,
      from: snapshot('h1', '1.0.0'),
      to: snapshot('h2', '1.0.1'),
      fromContent: 'FROM',
      toContent: 'TO',
      caseSet: cases,
      runs: 3,
      runtime: fake.runtime,
    });

    expect(fake.calls).toHaveLength(12);
    expect(fake.calls[0]?.cwd).toBe('/tmp/from');
    expect(fake.calls[1]?.cwd).toBe('/tmp/to');
    expect(fake.calls[4]?.cwd).toBe('/tmp/to');
    expect(fake.calls[5]?.cwd).toBe('/tmp/from');
    expect(fake.disposed).toEqual([undefined]);
    expect(result.results).toHaveLength(12);
    expect(result.summary.from.passRate).toBe(1);
    expect(result.summary.to.passRate).toBe(1);
    expect(result.summary.verdict).toBe('no-significant-difference');
  });

  it('写入两个版本的快照内容', async () => {
    const fake = createFakeRuntime();
    await runEvaluation({
      skill: 'foo',
      skillPath: `${SKILL_DIR}/SKILL.md`,
      from: snapshot('h1'),
      to: snapshot('h2'),
      fromContent: 'FROM',
      toContent: 'TO',
      caseSet: caseSet([{ id: 'a', prompt: 'p', expect: { contains: ['ok'] } }]),
      runs: 1,
      runtime: fake.runtime,
    });
    expect(fake.workspaces).toEqual([
      { label: 'from', name: 'foo', content: 'FROM' },
      { label: 'to', name: 'foo', content: 'TO' },
    ]);
  });

  it('超时与执行失败计为未通过且不中断', async () => {
    const fake = createFakeRuntime({
      output: (prompt) =>
        prompt === 'timeout'
          ? { text: '', timedOut: true, durationMs: 100 }
          : { text: '', timedOut: false, durationMs: 1, exitCode: 2, error: 'boom' },
    });
    const result = await runEvaluation({
      skill: 'foo',
      skillPath: `${SKILL_DIR}/SKILL.md`,
      from: snapshot('h1'),
      to: snapshot('h2'),
      fromContent: 'FROM',
      toContent: 'TO',
      caseSet: caseSet([
        { id: 'a', prompt: 'timeout', expect: { contains: ['ok'] } },
        { id: 'b', prompt: 'fail', expect: { contains: ['ok'] } },
      ]),
      runs: 1,
      runtime: fake.runtime,
    });

    expect(result.results).toHaveLength(4);
    expect(result.results.every((item) => !item.passed)).toBe(true);
    expect(result.results[0]?.timedOut).toBe(true);
    expect(result.results[2]?.reason).toContain('boom');
  });

  it('仅 rubric 用例调用裁判，裁判异常计为未通过', async () => {
    let judgeCalls = 0;
    const fake = createFakeRuntime({
      judge: async () => {
        judgeCalls += 1;
        throw new Error('judge down');
      },
    });
    const result = await runEvaluation({
      skill: 'foo',
      skillPath: `${SKILL_DIR}/SKILL.md`,
      from: snapshot('h1'),
      to: snapshot('h2'),
      fromContent: 'FROM',
      toContent: 'TO',
      caseSet: caseSet([{ id: 'a', prompt: 'p', expect: { rubric: 'must be nice' } }]),
      runs: 2,
      runtime: fake.runtime,
    });

    expect(judgeCalls).toBe(4);
    expect(result.results.every((item) => item.reason?.includes('裁判调用失败'))).toBe(true);
  });

  it('规则用例不调用裁判', async () => {
    let judgeCalls = 0;
    const fake = createFakeRuntime({
      judge: async () => {
        judgeCalls += 1;
        return { pass: true, reason: '' };
      },
    });
    await runEvaluation({
      skill: 'foo',
      skillPath: `${SKILL_DIR}/SKILL.md`,
      from: snapshot('h1'),
      to: snapshot('h2'),
      fromContent: 'FROM',
      toContent: 'TO',
      caseSet: cases,
      runs: 1,
      runtime: fake.runtime,
    });
    expect(judgeCalls).toBe(0);
  });

  it('非法 runs 抛错', async () => {
    const fake = createFakeRuntime();
    await expect(
      runEvaluation({
        skill: 'foo',
        skillPath: `${SKILL_DIR}/SKILL.md`,
        from: snapshot('h1'),
        to: snapshot('h2'),
        fromContent: 'FROM',
        toContent: 'TO',
        caseSet: cases,
        runs: 0,
        runtime: fake.runtime,
      }),
    ).rejects.toThrow('--runs');
  });
});

describe('buildEvalSummary', () => {
  function results(label: 'from' | 'to', total: number, passed: number): EvalCaseResult[] {
    return Array.from({ length: total }, (_item, index) => ({
      caseId: `c${index}`,
      label,
      run: 1,
      passed: index < passed,
      durationMs: 1,
      costUsd: index === 0 ? 0.01 : 0.03,
      inputTokens: 10,
      outputTokens: 20,
    }));
  }

  it('+10pp 判优化有效', () => {
    const summary = buildEvalSummary(
      [...results('from', 10, 9), ...results('to', 10, 10)],
      3,
      snapshot('h1'),
      snapshot('h2'),
    );
    expect(summary.deltaPp).toBe(10);
    expect(summary.verdict).toBe('improved');
  });

  it('+9.1pp 判无显著差异', () => {
    const summary = buildEvalSummary(
      [...results('from', 11, 10), ...results('to', 11, 11)],
      3,
      snapshot('h1'),
      snapshot('h2'),
    );
    expect(summary.verdict).toBe('no-significant-difference');
  });

  it('-10pp 判变差', () => {
    const summary = buildEvalSummary(
      [...results('from', 10, 10), ...results('to', 10, 9)],
      3,
      snapshot('h1'),
      snapshot('h2'),
    );
    expect(summary.deltaPp).toBe(-10);
    expect(summary.verdict).toBe('regressed');
    expect(summary.verdictLabel).toBe('变差');
  });

  it('汇总平均成本与 token', () => {
    const summary = buildEvalSummary(results('from', 2, 1), 3, snapshot('h1'), snapshot('h2'));
    expect(summary.from.avgCostUsd).toBeCloseTo(0.02);
    expect(summary.from.totalTokens).toBe(60);
  });

  it('runs 小于 2 标低置信', () => {
    expect(buildEvalSummary(results('from', 1, 1), 1, snapshot('h1'), snapshot('h2')).lowConfidence).toBe(
      true,
    );
  });
});

describe('裁判提示与解析', () => {
  it('提示词包含用例、评分标准与输出', () => {
    const prompt = buildJudgePrompt({ prompt: 'P', rubric: 'R', output: 'O' });
    expect(prompt).toContain('用例提示：P');
    expect(prompt).toContain('评分标准（rubric）：R');
    expect(prompt).toContain('O');
    expect(prompt).toContain('"pass"');
  });

  it('从夹杂文本中解析 JSON 判定', () => {
    expect(parseJudgeVerdict('结果：{"pass": true, "reason": "不错"} 完毕')).toEqual({
      pass: true,
      reason: '不错',
    });
  });

  it('无法解析时返回 null', () => {
    expect(parseJudgeVerdict('没有 JSON')).toBeNull();
    expect(parseJudgeVerdict('{"reason": "x"}')).toBeNull();
    expect(parseJudgeVerdict('{bad}')).toBeNull();
  });
});

describe('评测结果存储', () => {
  const dir = '/home/dev/.manage-skills/evals/results';

  function result(overrides: Partial<EvalResult> = {}): EvalResult {
    return {
      runId: 'eval-1',
      skill: 'foo',
      skillPath: `${SKILL_DIR}/SKILL.md`,
      from: snapshot('h1', '1.0.0'),
      to: snapshot('h2', '1.0.1'),
      casesPath: CASES_PATH,
      casesHash: 'ch',
      runs: 3,
      startedAt: '2026-11-25T00:00:00.000Z',
      finishedAt: '2026-11-25T00:10:00.000Z',
      results: [],
      summary: buildEvalSummary([], 3, snapshot('h1'), snapshot('h2')),
      warnings: [],
      ...overrides,
    };
  }

  it('保存到技能目录下并可按目录读回', async () => {
    const memory = createMemoryFs();
    const path = await saveEvalResult(memory.fs, dir, result());
    expect(path).toBe(`${dir}/foo/eval-1.json`);

    const loaded = await loadEvalResults(memory.fs, dir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.runId).toBe('eval-1');
  });

  it('损坏结果文件被跳过', async () => {
    const memory = createMemoryFs({ [`${dir}/foo/bad.json`]: '{bad' });
    expect(await loadEvalResults(memory.fs, dir)).toEqual([]);
  });

  it('最近评测结论按目标 hash 归集', () => {
    const older = result({
      runId: 'eval-1',
      finishedAt: '2026-11-25T00:10:00.000Z',
      summary: { ...result().summary, verdict: 'regressed', verdictLabel: '变差', deltaPp: -20 },
    });
    const newer = result({
      runId: 'eval-2',
      finishedAt: '2026-11-25T01:00:00.000Z',
      summary: { ...result().summary, verdict: 'improved', verdictLabel: '优化有效', deltaPp: 30 },
    });
    const map = latestEvalVerdicts([newer, older]);
    expect(map.get('h2')?.runId).toBe('eval-2');
    expect(map.get('h2')?.verdictLabel).toBe('优化有效');
  });
});