import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { runScan } from './commands/scan.js';
import { runClassify } from './commands/classify.js';
import { runAudit } from './commands/audit.js';
import { runDiff } from './commands/diff.js';
import { runSyncApply, runSyncPlan, runSyncRestore } from './commands/sync.js';

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

interface PackageMeta {
  version: string;
}

function readVersion(): string {
  try {
    const meta = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as PackageMeta;
    return meta.version;
  } catch {
    return '0.0.0';
  }
}

const program = new Command();

program
  .name('manage-skills')
  .description('本地优先的 agent 技能治理工具：盘点、分类、审计与 hub 对比')
  .version(readVersion());

program
  .command('scan')
  .description('扫描全部 agent 实例并更新本地索引')
  .option('--cwd <path>', '项目根目录（用于探测项目级技能目录）')
  .option('--json', '输出 JSON 摘要')
  .action(async (options: { cwd?: string; json?: boolean }) => {
    process.exitCode = await runScan(options);
  });

program
  .command('classify')
  .description('查看分类统计，或为技能设置分类（classify set <技能> --category <分类>）')
  .argument('[first]', '技能路径/名称，或子命令 set')
  .argument('[second]', '当第一个参数为 set 时的技能路径/名称')
  .option('--category <category>', '要设置的分类')
  .option('--write-frontmatter', '把分类写回 SKILL.md（默认只写索引）')
  .option('--dry-run', '配合 --write-frontmatter 预览改动，不写盘')
  .action(
    async (
      first: string | undefined,
      second: string | undefined,
      options: { category?: string; writeFrontmatter?: boolean; dryRun?: boolean },
    ) => {
      const target = first === 'set' ? second : first;
      if (first === 'set' && !second) {
        console.error('用法：manage-skills classify set <路径|技能名> --category <分类>');
        process.exitCode = 1;
        return;
      }
      process.exitCode = await runClassify({ target, ...options });
    },
  );

program
  .command('audit')
  .description('检测漂移、重复、无效与重名冲突')
  .option('--full', '附带差异内容（默认脱敏）')
  .option('--json', '输出 JSON 报告')
  .action(async (options: { full?: boolean; json?: boolean }) => {
    process.exitCode = await runAudit(options);
  });

program
  .command('diff')
  .description('与权威库（本地目录或 git 仓库）对比')
  .requiredOption('--hub <path|url>', '权威库路径或 git 地址')
  .option('--format <format>', '输出格式：md 或 json', 'md')
  .option('--full', '附带技能正文（默认脱敏）')
  .action(async (options: { hub: string; format?: string; full?: boolean }) => {
    process.exitCode = await runDiff(options);
  });

const sync = program.command('sync').description('同步：生成计划、执行与恢复');

sync
  .command('plan')
  .description('生成同步计划快照（不写任何技能文件）')
  .requiredOption('--hub <path|url>', '权威库路径或 git 地址')
  .option('--direction <direction>', 'push 或 pull', 'push')
  .option('--select <skill=side>', '冲突选边：技能名=hub|spoke|skip（可多次）', collect, [])
  .option('--target <agent>', '仅向指定 agent 生成新技能条目')
  .option('--json', '输出 JSON')
  .action(async (options: { hub: string; direction?: string; select?: string[]; target?: string; json?: boolean }) => {
    process.exitCode = await runSyncPlan(options);
  });

sync
  .command('apply')
  .description('执行计划快照（执行前校验 hash，自动备份）')
  .option('--plan <id|path>', '计划 id 或快照路径')
  .option('--backup-root <dir>', '备份根目录')
  .action(async (options: { plan?: string; backupRoot?: string }) => {
    process.exitCode = await runSyncApply(options);
  });

sync
  .command('restore')
  .description('从备份恢复（恢复前会二次备份当前状态）')
  .requiredOption('--backup <dir>', '备份目录（需包含 manifest.json）')
  .option('--skill <name>', '只恢复指定技能')
  .action(async (options: { backup: string; skill?: string }) => {
    process.exitCode = await runSyncRestore(options);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});