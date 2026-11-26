import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { delimiter, extname, isAbsolute, join } from 'node:path';
import type { EvalCommandOutput } from '@manage-skills/core';

const execFileAsync = promisify(execFile);

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

/** 生成候选可执行路径：Windows 优先带 PATHEXT 扩展名，避免命中不能直接执行的 shim。 */
export function resolveExecutableCandidates(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const hasSeparator = command.includes('/') || command.includes('\\') || isAbsolute(command);
  const pathext =
    platform === 'win32'
      ? (env['PATHEXT'] ?? DEFAULT_PATHEXT).split(';').filter(Boolean)
      : [];

  const names = (base: string): string[] => {
    if (extname(base)) return [base];
    return platform === 'win32' ? [...pathext.map((ext) => `${base}${ext}`), base] : [base];
  };

  if (hasSeparator) return names(command);

  const dirs = (env['PATH'] ?? '').split(delimiter).filter(Boolean);
  return dirs.flatMap((dir) => names(join(dir, command)));
}

/** 解析出真实可执行文件路径；找不到时报错并指出配置字段。 */
export async function resolveExecutable(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<string> {
  for (const candidate of resolveExecutableCandidates(command, env, platform)) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // 继续尝试下一个候选
    }
  }
  throw new Error(
    `找不到可执行文件：${command}（可在 ~/.manage-skills/config.json 的 evalRunner.command 中配置）`,
  );
}

/** 宽松解析外部 CLI 输出：优先读 JSON 结果，失败时把原文当文本。 */
export function parseRunnerOutput(stdout: string, durationMs: number): EvalCommandOutput {
  const trimmed = stdout.trim();
  const base: EvalCommandOutput = { text: trimmed, timedOut: false, durationMs };
  if (!trimmed) return base;

  try {
    const data: unknown = JSON.parse(trimmed);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return base;
    const record = data as Record<string, unknown>;
    const usage =
      typeof record['usage'] === 'object' && record['usage'] !== null
        ? (record['usage'] as Record<string, unknown>)
        : {};

    return {
      text: typeof record['result'] === 'string' ? record['result'] : trimmed,
      timedOut: false,
      durationMs,
      ...(typeof record['total_cost_usd'] === 'number'
        ? { costUsd: record['total_cost_usd'] }
        : {}),
      ...(typeof usage['input_tokens'] === 'number' ? { inputTokens: usage['input_tokens'] } : {}),
      ...(typeof usage['output_tokens'] === 'number' ? { outputTokens: usage['output_tokens'] } : {}),
      ...(record['is_error'] === true
        ? {
            error:
              typeof record['result'] === 'string' && record['result'].trim()
                ? record['result']
                : '执行返回错误',
          }
        : {}),
    };
  } catch {
    return base;
  }
}

export interface RunCommandOptions {
  cwd: string;
  prompt: string;
  timeoutMs: number;
}

/** 执行外部 CLI（不使用 shell，prompt 作为最后一个参数追加）。 */
export async function runCommand(
  executable: string,
  args: string[],
  options: RunCommandOptions,
): Promise<EvalCommandOutput> {
  const startedAt = Date.now();
  try {
    const { stdout } = await execFileAsync(executable, [...args, options.prompt], {
      cwd: options.cwd,
      timeout: options.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      encoding: 'utf8',
    });
    return parseRunnerOutput(stdout, Date.now() - startedAt);
  } catch (error) {
    const detail = error as {
      stdout?: string;
      killed?: boolean;
      signal?: string;
      code?: number | string;
      message: string;
    };
    const durationMs = Date.now() - startedAt;
    if (detail.killed || detail.signal === 'SIGTERM') {
      return { ...parseRunnerOutput(detail.stdout ?? '', durationMs), timedOut: true };
    }
    const parsed = parseRunnerOutput(detail.stdout ?? '', durationMs);
    return {
      ...parsed,
      ...(typeof detail.code === 'number' ? { exitCode: detail.code } : {}),
      error: detail.message,
    };
  }
}