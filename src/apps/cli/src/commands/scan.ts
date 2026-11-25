import {
  discoverInstances,
  loadIndex,
  mergeScan,
  resolveScanRoots,
  saveIndex,
  scanInstances,
  type ManageSkillsConfig,
} from '@manage-skills/core';
import { createNodeFs } from '../io/node-fs.js';
import { createPlatformEnv } from '../io/env.js';
import { configPath, indexPath } from '../io/paths.js';

export interface ScanOptions {
  cwd?: string;
  json?: boolean;
}

export async function runScan(options: ScanOptions): Promise<number> {
  const startedAt = Date.now();
  const env = createPlatformEnv();
  const fs = createNodeFs();
  const cwd = options.cwd ?? process.cwd();

  let config: ManageSkillsConfig = {};
  const cfgPath = configPath(env.homedir);
  try {
    if (await fs.stat(cfgPath)) {
      config = JSON.parse(await fs.readTextFile(cfgPath)) as ManageSkillsConfig;
    }
  } catch (error) {
    console.error(`[warn] 配置读取失败，按默认继续：${error instanceof Error ? error.message : String(error)}`);
  }

  const base = discoverInstances(env, { cwd });
  const { instances, warnings } = resolveScanRoots(base, config, env);
  for (const warning of warnings) console.error(`[warn] ${warning}`);

  const records = await scanInstances(fs, instances);
  const idxPath = indexPath(env.homedir);
  const loaded = await loadIndex(fs, idxPath);
  if (loaded.error) {
    console.error(`索引不可用：${loaded.error}`);
    return 2;
  }

  const index = mergeScan(loaded.index, records);
  await saveIndex(fs, idxPath, index);

  const summary = {
    instances: instances.length,
    skills: records.length,
    invalid: records.filter((record) => record.status === 'invalid').length,
    stale: index.skills.filter((record) => record.stale).length,
    elapsedMs: Date.now() - startedAt,
    index: idxPath,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(
      `实例 ${summary.instances} · 技能 ${summary.skills} · 无效 ${summary.invalid} · ` +
        `过期 ${summary.stale} · 耗时 ${(summary.elapsedMs / 1000).toFixed(1)}s`,
    );
    console.log(`索引：${summary.index}`);
  }
  return 0;
}