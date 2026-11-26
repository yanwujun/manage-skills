import {
  DEFAULT_EVAL_TIMEOUT_MS,
  buildJudgePrompt,
  dirName,
  loadEvalCases,
  loadEvalResults,
  loadHistory,
  parseJudgeVerdict,
  readBlob,
  resolveEvalRunner,
  resolveEvalVersions,
  runEvaluation,
  saveEvalResult,
  type EvalResult,
  type EvalRuntime,
  type FileSystem,
  type ManageSkillsConfig,
} from '@manage-skills/core';
import { createNodeFs } from '../io/node-fs.js';
import { createPlatformEnv } from '../io/env.js';
import { blobsDir, configPath, evalResultsDir, historyPath } from '../io/paths.js';
import { confirm } from '../io/confirm.js';
import { resolveExecutable, runCommand } from '../io/runner.js';
import { createEvalWorkspace } from '../io/workspace.js';

export interface EvalCompareOptions {
  action?: string;
  skill?: string;
  path?: string;
  from?: string;
  to?: string;
  runs?: string;
  keep?: boolean;
  yes?: boolean;
  json?: boolean;
}

function shortHash(hash: string): string {
  return hash.slice(0, 8);
}

function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function money(value: number | undefined): string {
  return typeof value === 'number' ? `$${value.toFixed(4)}` : '—';
}

function versionLabel(version: string | undefined): string {
  return version ?? '(无版本)';
}

async function readConfig(fs: FileSystem, home: string): Promise<ManageSkillsConfig> {
  try {
    if (await fs.stat(configPath(home))) {
      return JSON.parse(await fs.readTextFile(configPath(home))) as ManageSkillsConfig;
    }
  } catch (error) {
    console.error(`[warn] 配置读取失败，按默认继续：${error instanceof Error ? error.message : String(error)}`);
  }
  return {};
}

function printReport(result: EvalResult, resultPath: string): void {
  const { summary } = result;
  for (const warning of result.warnings) console.log(`注意：${warning}`);
  console.log(`技能：${result.skill}`);
  console.log(
    `对比：${versionLabel(result.from.version)} (${shortHash(result.from.hash)}) → ` +
      `${versionLabel(result.to.version)} (${shortHash(result.to.hash)})`,
  );
  console.log(
    `用例：${new Set(result.results.map((item) => item.caseId)).size} 条` +
      `（hash ${shortHash(result.casesHash)}）· 每版 ${result.runs} 次`,
  );
  console.log(
    `通过率：${percent(summary.from.passRate)} → ${percent(summary.to.passRate)}` +
      `（${summary.deltaPp >= 0 ? '+' : ''}${summary.deltaPp}pp）`,
  );
  console.log(`判定：${summary.verdictLabel}${summary.lowConfidence ? '（低置信：--runs 1）' : ''}`);
  console.log(
    `成本：平均 ${money(summary.from.avgCostUsd)}/次 → ${money(summary.to.avgCostUsd)}/次`,
  );
  console.log(
    `token：${summary.from.totalTokens ?? '—'} → ${summary.to.totalTokens ?? '—'}`,
  );

  const caseIds = [...new Set(result.results.map((item) => item.caseId))];
  console.log('逐用例：');
  for (const caseId of caseIds) {
    const rows = result.results.filter((item) => item.caseId === caseId);
    const from = rows.filter((item) => item.label === 'from');
    const to = rows.filter((item) => item.label === 'to');
    console.log(
      `  ${caseId}  from ${from.filter((item) => item.passed).length}/${from.length}` +
        `  to ${to.filter((item) => item.passed).length}/${to.length}`,
    );
  }
  console.log(`结果：${resultPath}`);
}

export async function runEvalCompare(options: EvalCompareOptions): Promise<number> {
  if (options.action !== 'compare') {
    console.error('用法：manage-skills eval compare <技能> [--path <路径>] [--from <版本>] [--to <版本>] [--runs 3]');
    return 1;
  }
  if (!options.skill) {
    console.error('请指定技能名：manage-skills eval compare <技能>');
    return 1;
  }

  const runs = options.runs === undefined ? 3 : Number(options.runs);
  if (!Number.isInteger(runs) || runs < 1) {
    console.error('--runs 必须是正整数');
    return 1;
  }

  const env = createPlatformEnv();
  const fs = createNodeFs();

  let runner: { command: string; args: string[] };
  try {
    const config = await readConfig(fs, env.homedir);
    runner = resolveEvalRunner(config.evalRunner);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const loaded = await loadHistory(fs, historyPath(env.homedir));
  if (loaded.error) {
    console.error(loaded.error);
    return 1;
  }

  const resolved = resolveEvalVersions(loaded.entries, options.skill, {
    ...(options.path ? { path: options.path } : {}),
    ...(options.from ? { from: options.from } : {}),
    ...(options.to ? { to: options.to } : {}),
  });
  if (!resolved.ok) {
    console.error(resolved.error);
    return 1;
  }

  const cases = await loadEvalCases(fs, dirName(resolved.skillPath));
  if (!cases.set) {
    console.error(cases.error ?? '用例加载失败');
    return 1;
  }

  const [fromContent, toContent] = await Promise.all([
    readBlob(fs, blobsDir(env.homedir), resolved.from.hash),
    readBlob(fs, blobsDir(env.homedir), resolved.to.hash),
  ]);
  if (fromContent === null || toContent === null) {
    console.error(
      `快照缺失：${fromContent === null ? resolved.from.hash : resolved.to.hash}` +
        '（执行 manage-skills scan 重新建立历史）',
    );
    return 1;
  }

  const warnings: string[] = [];
  const previousResults = await loadEvalResults(fs, evalResultsDir(env.homedir));
  const previous = previousResults
    .filter((item) => item.skill === options.skill)
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0];
  if (previous && previous.casesHash !== cases.set.hash) {
    warnings.push(`用例已变，分数不可比（上次 hash ${shortHash(previous.casesHash)}）`);
  }

  const calls = cases.set.cases.length * runs * 2;
  const rubricCount = cases.set.cases.filter((item) => item.expect.rubric).length;
  console.log(
    `预计调用 ${calls} 次（用例 ${cases.set.cases.length} × 次数 ${runs} × 2 版本）` +
      (rubricCount > 0 ? `，另加 ${rubricCount * runs * 2} 次裁判调用` : ''),
  );
  if (!options.yes) {
    if (!process.stdin.isTTY) {
      console.error('非交互环境请加 --yes 确认执行');
      return 1;
    }
    const ok = await confirm('确认执行评测？(y/N) ');
    if (!ok) {
      console.log('已取消');
      return 0;
    }
  }

  let executable: string;
  try {
    executable = await resolveExecutable(runner.command);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const workspace = await createEvalWorkspace();
  const runtime: EvalRuntime = {
    createWorkspace: (label, skillName, content) => workspace.create(label, skillName, content),
    run: (cwd, prompt, timeoutMs) =>
      runCommand(executable, runner.args, { cwd, prompt, timeoutMs }),
    judge: async (input) => {
      const output = await runCommand(executable, runner.args, {
        cwd: process.cwd(),
        prompt: buildJudgePrompt(input),
        timeoutMs: DEFAULT_EVAL_TIMEOUT_MS,
      });
      if (output.timedOut) return { pass: false, reason: '裁判调用超时' };
      if (output.error) return { pass: false, reason: `裁判调用失败：${output.error}` };
      const verdict = parseJudgeVerdict(output.text);
      if (!verdict) return { pass: false, reason: `裁判响应无法解析：${output.text.slice(0, 120)}` };
      return verdict;
    },
    dispose: (keep) => workspace.dispose(keep),
  };

  const result = await runEvaluation({
    skill: options.skill,
    skillPath: resolved.skillPath,
    from: resolved.from,
    to: resolved.to,
    fromContent,
    toContent,
    caseSet: cases.set,
    runs,
    runtime,
    ...(options.keep ? { keep: true } : {}),
    warnings,
  });

  const resultPath = await saveEvalResult(fs, evalResultsDir(env.homedir), result);
  if (options.keep) console.log(`临时工作区：${workspace.root}`);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReport(result, resultPath);
  }
  return 0;
}