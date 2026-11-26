import {
  applyFrontmatterWrite,
  buildHistoryEntryFromFile,
  loadHistory,
  loadIndex,
  parseSkillFile,
  persistHistoryEntries,
  planFrontmatterFieldWrite,
  planVersionBump,
  type VersionBumpKind,
} from '@manage-skills/core';
import { createNodeFs } from '../io/node-fs.js';
import { createPlatformEnv } from '../io/env.js';
import { blobsDir, historyPath, indexPath } from '../io/paths.js';
import { confirm } from '../io/confirm.js';

export interface VersionBumpOptions {
  target?: string;
  kind?: string;
  note?: string;
  yes?: boolean;
  dryRun?: boolean;
}

const KINDS: readonly VersionBumpKind[] = ['patch', 'minor', 'major'];

export async function runVersionBump(options: VersionBumpOptions): Promise<number> {
  if (!options.target) {
    console.error('用法：manage-skills version bump <路径|技能名> [--kind patch|minor|major] [--note "..."]');
    return 1;
  }

  const kind = (options.kind ?? 'patch') as VersionBumpKind;
  if (!KINDS.includes(kind)) {
    console.error('--kind 只支持 patch、minor 或 major');
    return 1;
  }

  const env = createPlatformEnv();
  const fs = createNodeFs();
  const loaded = await loadIndex(fs, indexPath(env.homedir));
  if (!loaded.index) {
    console.error('索引不存在，请先运行 manage-skills scan');
    return 1;
  }

  const matches = loaded.index.skills.filter(
    (record) => record.path === options.target || record.frontmatter.name === options.target,
  );
  if (matches.length === 0) {
    console.error(`未在索引中找到技能：${options.target}`);
    return 1;
  }
  if (matches.length > 1) {
    console.error(`技能名对应多个路径，请用完整路径指定：`);
    for (const record of matches) console.error(`  ${record.path}`);
    return 1;
  }
  const record = matches[0]!;

  const content = await fs.readTextFile(record.path);
  const current = parseSkillFile(content).frontmatter.version ?? record.frontmatter.version;
  let next: string;
  try {
    next = planVersionBump(current, kind);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const plan = planFrontmatterFieldWrite(record.path, content, 'version', next);
  console.log(`技能：${record.frontmatter.name ?? record.path}`);
  console.log(`版本：${current ?? '（无）'} → ${next}`);
  console.log(`文件：${record.path}`);

  if (options.dryRun) {
    console.log('[dry-run] 将写入：');
    console.log(plan.nextContent);
    return 0;
  }

  if (!options.yes) {
    if (!process.stdin.isTTY) {
      console.error('非交互环境请加 --yes 确认写入');
      return 1;
    }
    const ok = await confirm('确认写入并记录 bump 历史？(y/N) ');
    if (!ok) {
      console.log('已取消');
      return 0;
    }
  }

  const result = await applyFrontmatterWrite(fs, plan);
  if (!result.written) {
    console.log('版本无需变更');
    return 0;
  }
  console.log(`已写入：${record.path}（备份：${result.backupPath}）`);

  const entry = await buildHistoryEntryFromFile(fs, record.path, {
    agent: record.agent,
    instanceId: record.instanceId,
    cause: 'bump',
    ...(options.note ? { note: options.note } : {}),
  });
  if (!entry) {
    console.error('[warn] 历史条目构建失败，版本已写入但未记录历史');
    return 0;
  }

  const history = await loadHistory(fs, historyPath(env.homedir));
  if (history.error) console.error(`[warn] ${history.error}`);
  const persisted = await persistHistoryEntries(
    fs,
    { historyPath: historyPath(env.homedir), blobsDir: blobsDir(env.homedir) },
    [entry],
    history.entries,
  );
  for (const warning of persisted.warnings) console.error(`[warn] ${warning}`);
  if (persisted.added.length > 0) {
    console.log(`已记录历史：bump ${next}${options.note ? `（${options.note}）` : ''}`);
  }
  return 0;
}