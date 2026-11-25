import { execFile } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveHub, scanHub, type GitRunner } from '../src/index.js';
import { createNodeFs } from './helpers/node-fs.js';

const run = promisify(execFile);

async function git(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await run('git', args, { cwd });
  return stdout;
}

const gitRunner: GitRunner = {
  async clone(url, targetDir) {
    await git(['clone', url, targetDir]);
  },
  async pull(dir) {
    await git(['-C', dir, 'pull']);
  },
};

let workDir = '';
let bareRepo = '';

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'manage-skills-hub-'));

  const source = join(workDir, 'source');
  await fsp.mkdir(join(source, 'alpha'), { recursive: true });
  await fsp.writeFile(
    join(source, 'alpha', 'SKILL.md'),
    '---\nname: alpha\ndescription: 远程 hub 技能\n---\n\n正文\n',
    'utf8',
  );

  await git(['init'], source);
  await git(['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'add', '.'], source);
  await git(
    ['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'],
    source,
  );

  bareRepo = join(workDir, 'hub.git');
  await git(['clone', '--bare', source, bareRepo]);
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('远程 hub 访问', () => {
  it('经 git clone 到缓存目录后可扫描', async () => {
    const cacheDir = join(workDir, 'cache');
    const result = await resolveHub(createNodeFs(), pathToFileURL(bareRepo).href, {
      cacheDir,
      git: gitRunner,
    });

    expect(result.cloned).toBe(true);
    expect(result.root).toBe(cacheDir);

    const hub = await scanHub(createNodeFs(), result.root);
    expect(hub.skills.map((skill) => skill.name)).toEqual(['alpha']);
  }, 60_000);

  it('仓库不可达时明确报错', async () => {
    const cacheDir = join(workDir, 'cache-fail');
    await expect(
      resolveHub(createNodeFs(), pathToFileURL(join(workDir, 'missing.git')).href, {
        cacheDir,
        git: gitRunner,
      }),
    ).rejects.toThrow('无法访问 hub 仓库');
  }, 60_000);

  it('本地路径不触发 git', async () => {
    const result = await resolveHub(createNodeFs(), workDir, { cacheDir: join(workDir, 'x') });
    expect(result.cloned).toBe(false);
    expect(result.root).toBe(workDir);
  });
});