import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseRunnerOutput,
  resolveExecutable,
  resolveExecutableCandidates,
  runCommand,
} from '../src/io/runner.js';
import { createEvalWorkspace } from '../src/io/workspace.js';

const created: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'manage-skills-runner-'));
  created.push(dir);
  return dir;
}

async function fakeScript(body: string): Promise<{ dir: string; script: string }> {
  const dir = await tempDir();
  const script = join(dir, 'fake.mjs');
  await writeFile(script, body, 'utf8');
  return { dir, script };
}

afterEach(async () => {
  for (const dir of created.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('parseRunnerOutput', () => {
  it('读取 JSON 结果中的文本、成本与 token', () => {
    const output = parseRunnerOutput(
      JSON.stringify({
        result: 'done',
        total_cost_usd: 0.02,
        usage: { input_tokens: 4, output_tokens: 6 },
      }),
      12,
    );
    expect(output).toMatchObject({
      text: 'done',
      costUsd: 0.02,
      inputTokens: 4,
      outputTokens: 6,
      durationMs: 12,
      timedOut: false,
    });
  });

  it('非 JSON 输出回退为文本', () => {
    expect(parseRunnerOutput('plain text', 3).text).toBe('plain text');
  });

  it('is_error 为真时标记错误', () => {
    const output = parseRunnerOutput(JSON.stringify({ result: 'bad', is_error: true }), 1);
    expect(output.error).toBe('bad');
  });

  it('空输出返回空文本', () => {
    expect(parseRunnerOutput('', 1).text).toBe('');
  });
});

describe('resolveExecutable', () => {
  it('Windows 候选包含 PATHEXT 扩展名', () => {
    const candidates = resolveExecutableCandidates(
      'claude',
      { PATH: 'C:\\bin', PATHEXT: '.EXE;.CMD' },
      'win32',
    );
    expect(candidates.some((item) => /claude\.cmd$/i.test(item))).toBe(true);
    expect(candidates.some((item) => /claude\.exe$/i.test(item))).toBe(true);
  });

  it('绝对路径直接作为候选', () => {
    expect(resolveExecutableCandidates('/opt/bin/tool', {}, 'linux')).toEqual(['/opt/bin/tool']);
  });

  it('能找到当前 node 可执行文件', async () => {
    expect(await resolveExecutable(process.execPath)).toBe(process.execPath);
  });

  it('找不到时报错并指出配置字段', async () => {
    await expect(resolveExecutable('definitely-not-a-real-command-xyz')).rejects.toThrow(
      'evalRunner.command',
    );
  });
});

describe('runCommand', () => {
  it('成功时解析 JSON 结果', async () => {
    const { script } = await fakeScript(
      `const prompt = process.argv[process.argv.length - 1];
process.stdout.write(JSON.stringify({ result: 'OK:' + prompt, total_cost_usd: 0.02, usage: { input_tokens: 4, output_tokens: 6 } }));`,
    );
    const output = await runCommand(process.execPath, [script], {
      cwd: tmpdir(),
      prompt: 'hello',
      timeoutMs: 10_000,
    });

    expect(output.text).toBe('OK:hello');
    expect(output.costUsd).toBe(0.02);
    expect(output.timedOut).toBe(false);
  });

  it('非 JSON 输出保留原文', async () => {
    const { script } = await fakeScript(`process.stdout.write('plain');`);
    const output = await runCommand(process.execPath, [script], {
      cwd: tmpdir(),
      prompt: 'x',
      timeoutMs: 10_000,
    });
    expect(output.text).toBe('plain');
  });

  it('超时被标记且不抛异常', async () => {
    const { script } = await fakeScript(`setTimeout(() => {}, 5000);`);
    const output = await runCommand(process.execPath, [script], {
      cwd: tmpdir(),
      prompt: 'x',
      timeoutMs: 100,
    });
    expect(output.timedOut).toBe(true);
  });

  it('非零退出记录退出码与错误', async () => {
    const { script } = await fakeScript(`process.exit(3);`);
    const output = await runCommand(process.execPath, [script], {
      cwd: tmpdir(),
      prompt: 'x',
      timeoutMs: 10_000,
    });
    expect(output.exitCode).toBe(3);
    expect(output.error).toBeTruthy();
  });
});

describe('createEvalWorkspace', () => {
  it('按版本写出临时技能文件', async () => {
    const workspace = await createEvalWorkspace();
    const cwd = await workspace.create('from', 'foo', '---\nname: foo\n---\nbody');

    expect(cwd).toBe(join(workspace.root, 'from'));
    const content = await readFile(join(cwd, '.claude', 'skills', 'foo', 'SKILL.md'), 'utf8');
    expect(content).toContain('body');
    await workspace.dispose();
  });

  it('默认清理，keep 时保留', async () => {
    const workspace = await createEvalWorkspace();
    await workspace.create('to', 'foo', 'x');
    await workspace.dispose(true);
    expect((await stat(workspace.root)).isDirectory()).toBe(true);

    await workspace.dispose();
    await expect(stat(workspace.root)).rejects.toThrow();
  });

  it('技能名中的特殊字符被替换', async () => {
    const workspace = await createEvalWorkspace();
    const cwd = await workspace.create('from', 'a/b c', 'x');
    expect(await stat(join(cwd, '.claude', 'skills', 'a_b_c', 'SKILL.md'))).toBeTruthy();
    await workspace.dispose();
  });
});