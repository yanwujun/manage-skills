import { buildAuditReport, loadIndex, renderAuditMarkdown } from '@manage-skills/core';
import { createNodeFs } from '../io/node-fs.js';
import { createPlatformEnv } from '../io/env.js';
import { indexPath } from '../io/paths.js';

export interface AuditOptions {
  full?: boolean;
  json?: boolean;
}

export async function runAudit(options: AuditOptions): Promise<number> {
  const env = createPlatformEnv();
  const fs = createNodeFs();
  const loaded = await loadIndex(fs, indexPath(env.homedir));
  if (!loaded.index) {
    console.error('索引不存在，请先运行 manage-skills scan');
    return 1;
  }

  const report = await buildAuditReport(loaded.index.skills, {
    full: options.full,
    readText: (path) => fs.readTextFile(path),
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderAuditMarkdown(report));
  }
  return 0;
}