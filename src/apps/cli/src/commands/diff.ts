import {
  buildHubDiff,
  loadIndex,
  renderHubDiffJson,
  renderHubDiffMarkdown,
  resolveHub,
} from '@manage-skills/core';
import { createNodeFs } from '../io/node-fs.js';
import { createPlatformEnv } from '../io/env.js';
import { hubCacheDir, indexPath } from '../io/paths.js';
import { createGitRunner } from '../io/git.js';

export interface DiffOptions {
  hub: string;
  format?: string;
  full?: boolean;
}

export async function runDiff(options: DiffOptions): Promise<number> {
  const env = createPlatformEnv();
  const fs = createNodeFs();
  const loaded = await loadIndex(fs, indexPath(env.homedir));
  if (!loaded.index) {
    console.error('索引不存在，请先运行 manage-skills scan');
    return 1;
  }

  const resolved = await resolveHub(fs, options.hub, {
    cacheDir: hubCacheDir(env.homedir),
    git: createGitRunner(),
  });

  const report = await buildHubDiff(fs, resolved.root, loaded.index.skills, {
    full: options.full,
  });

  console.log(options.format === 'json' ? renderHubDiffJson(report) : renderHubDiffMarkdown(report));
  return 0;
}