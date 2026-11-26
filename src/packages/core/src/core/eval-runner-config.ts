import type { EvalRunnerConfig } from '../types/index.js';

export const DEFAULT_EVAL_RUNNER: Required<EvalRunnerConfig> = {
  command: 'claude',
  args: ['-p', '--output-format', 'json'],
};

/** 校验并补全评测执行器配置；字段非法时报错并指出具体字段。 */
export function resolveEvalRunner(
  config?: EvalRunnerConfig | null,
): Required<EvalRunnerConfig> {
  if (config === undefined || config === null) return { ...DEFAULT_EVAL_RUNNER, args: [...DEFAULT_EVAL_RUNNER.args] };

  const command = config.command ?? DEFAULT_EVAL_RUNNER.command;
  if (typeof command !== 'string' || command.trim().length === 0) {
    throw new Error('evalRunner.command 必须是非空字符串');
  }

  const args = config.args ?? DEFAULT_EVAL_RUNNER.args;
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new Error('evalRunner.args 必须是字符串数组');
  }

  return { command: command.trim(), args: [...args] };
}