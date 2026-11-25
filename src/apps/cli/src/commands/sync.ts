import {
  buildSyncPlan,
  discoverInstances,
  executeSyncPlan,
  loadIndex,
  loadPlan,
  previewSyncPlan,
  restoreBackup,
  savePlan,
  type BackupManifest,
  type SyncDirection,
  type SyncSelection,
} from '@manage-skills/core';
import { createNodeFs } from '../io/node-fs.js';
import { createPlatformEnv } from '../io/env.js';
import { backupsDir, indexPath, planPath } from '../io/paths.js';

export interface SyncPlanOptions {
  hub: string;
  direction?: string;
  select?: string[];
  target?: string;
  json?: boolean;
}

const SIDES: readonly SyncSelection[] = ['hub', 'spoke', 'skip'];

export async function runSyncPlan(options: SyncPlanOptions): Promise<number> {
  const env = createPlatformEnv();
  const fs = createNodeFs();
  const loaded = await loadIndex(fs, indexPath(env.homedir));
  if (!loaded.index) {
    console.error('索引不存在，请先运行 manage-skills scan');
    return 1;
  }

  const direction = (options.direction ?? 'push') as SyncDirection;
  if (direction !== 'push' && direction !== 'pull') {
    console.error('--direction 只支持 push 或 pull');
    return 1;
  }

  const selections: Record<string, SyncSelection> = {};
  for (const entry of options.select ?? []) {
    const [name, side] = entry.split('=');
    if (!name || !side || !SIDES.includes(side as SyncSelection)) {
      console.error(`无效的选边：${entry}（格式：技能名=hub|spoke|skip）`);
      return 1;
    }
    selections[name] = side as SyncSelection;
  }

  const instances = discoverInstances(env, { cwd: process.cwd() });
  const targets = options.target
    ? instances.filter((instance) => instance.agent === options.target)
    : [];

  const plan = await buildSyncPlan(fs, options.hub, loaded.index.skills, {
    direction,
    selections,
    targets,
    readOnlyHubs: [options.hub],
  });

  const path = planPath(env.homedir, plan.id);
  await savePlan(fs, path, plan);
  const preview = previewSyncPlan(plan);

  if (options.json) {
    console.log(JSON.stringify({ planPath: path, plan, preview }, null, 2));
    return 0;
  }

  console.log(`计划 ${plan.id} 已保存：${path}`);
  console.log(
    `创建 ${plan.counts.create} · 更新 ${plan.counts.update} · ` +
      `冲突 ${plan.counts.conflict} · 跳过 ${plan.counts.skipped}`,
  );
  if (preview.empty) {
    console.log('无需同步');
  } else {
    for (const line of preview.lines) console.log(line);
  }
  return 0;
}

export interface SyncApplyOptions {
  plan?: string;
  backupRoot?: string;
}

export async function runSyncApply(options: SyncApplyOptions): Promise<number> {
  const env = createPlatformEnv();
  const fs = createNodeFs();

  const planArg = options.plan;
  if (!planArg) {
    console.error('请通过 --plan 指定计划 id 或快照路径');
    return 1;
  }
  const planFile = /[\\/]/.test(planArg) ? planArg : planPath(env.homedir, planArg);

  const loaded = await loadPlan(fs, planFile);
  if (!loaded.plan) {
    console.error(loaded.error ?? `计划不存在：${planFile}`);
    return 1;
  }

  const instances = discoverInstances(env, { cwd: process.cwd() });
  const report = await executeSyncPlan(fs, loaded.plan, {
    backupRoot: options.backupRoot ?? backupsDir(env.homedir),
    allowedRoots: instances.map((instance) => instance.root),
    readOnlyHubs: [loaded.plan.hubRoot],
  });

  console.log(
    `执行完成：创建 ${report.counts.created} · 更新 ${report.counts.updated} · ` +
      `跳过 ${report.counts.skipped} · 失败 ${report.counts.failed}`,
  );
  if (report.backupDir) console.log(`备份：${report.backupDir}`);
  for (const result of report.results) {
    if (result.status === 'failed' || result.status === 'skipped') {
      console.log(`  [${result.status}] ${result.skillName}：${result.reason ?? ''}`);
    }
  }
  return report.counts.failed > 0 ? 2 : 0;
}

export interface SyncRestoreOptions {
  backup: string;
  skill?: string;
}

export async function runSyncRestore(options: SyncRestoreOptions): Promise<number> {
  const fs = createNodeFs();
  const manifestPath = `${options.backup.replace(/[\\/]+$/, '')}/manifest.json`;

  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(await fs.readTextFile(manifestPath)) as BackupManifest;
  } catch (error) {
    console.error(
      `无法读取备份清单：${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }

  const report = await restoreBackup(fs, options.backup, manifest, {
    ...(options.skill ? { skillName: options.skill } : {}),
  });
  console.log(`恢复完成：成功 ${report.restored} · 失败 ${report.failed}`);
  for (const result of report.results) {
    if (result.status === 'failed') console.log(`  [failed] ${result.path}：${result.reason ?? ''}`);
  }
  return report.failed > 0 ? 2 : 0;
}