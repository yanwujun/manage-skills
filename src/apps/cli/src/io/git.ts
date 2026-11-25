import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitRunner } from '@manage-skills/core';

const run = promisify(execFile);

/** 远程 hub 的访问能力：只调用用户本机 git，不自建网络请求。 */
export function createGitRunner(): GitRunner {
  return {
    async clone(url, targetDir) {
      await run('git', ['clone', '--depth', '1', url, targetDir]);
    },
    async pull(dir) {
      await run('git', ['-C', dir, 'pull', '--ff-only']);
    },
  };
}