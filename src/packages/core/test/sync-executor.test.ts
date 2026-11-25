import { describe, expect, it } from 'vitest';
import {
  buildSyncPlan,
  executeSyncPlan,
  pruneSkill,
  restoreBackup,
  sha256Hex,
  utf8Encode,
  type BackupManifest,
  type FileSystem,
  type SkillRecord,
} from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';

const HUB_SKILL = '/hub/alpha/SKILL.md';
const SPOKE_SKILL = '/home/dev/.claude/skills/alpha/SKILL.md';
const BACKUP_ROOT = '/home/dev/.manage-skills/backups';

const content = (name: string, body: string): string =>
  `---\nname: ${name}\ndescription: ${name}\n---\n\n${body}\n`;
const hash = (name: string, body: string): string => sha256Hex(utf8Encode(content(name, body)));

function spoke(body: string): SkillRecord {
  return {
    id: 'claude:alpha/SKILL.md',
    instanceId: 'claude',
    agent: 'claude-code',
    root: '/home/dev/.claude/skills',
    path: SPOKE_SKILL,
    relativePath: 'alpha/SKILL.md',
    hash: hash('alpha', body),
    size: content('alpha', body).length,
    mtimeMs: 1000,
    frontmatter: { name: 'alpha' },
    status: 'ok',
  };
}

function setup(): ReturnType<typeof createMemoryFs> {
  return createMemoryFs({
    [HUB_SKILL]: content('alpha', '新正文'),
    [SPOKE_SKILL]: content('alpha', '旧正文'),
  });
}

async function planFor(memory: ReturnType<typeof createMemoryFs>) {
  return buildSyncPlan(memory.fs, '/hub', [spoke('旧正文')], {
    selections: { alpha: 'hub' },
  });
}

describe('执行与门禁', () => {
  it('目标不在授权实例目录内时拒绝', async () => {
    const memory = setup();
    const plan = await planFor(memory);
    const report = await executeSyncPlan(memory.fs, plan, {
      backupRoot: BACKUP_ROOT,
      allowedRoots: ['/elsewhere/skills'],
    });
    expect(report.counts.failed).toBe(1);
    expect(report.results[0]?.reason).toContain('不在已授权的实例目录内');
  });

  it('目标位于只读 hub 时拒绝', async () => {
    const memory = setup();
    const plan = await planFor(memory);
    const report = await executeSyncPlan(memory.fs, plan, {
      backupRoot: BACKUP_ROOT,
      readOnlyHubs: ['/home/dev/.claude'],
    });
    expect(report.results[0]?.status).toBe('failed');
  });

  it('目标是符号链接时拒绝覆盖', async () => {
    const memory = setup();
    const plan = await planFor(memory);
    const fsWithLink: FileSystem = {
      ...memory.fs,
      async stat(path) {
        const stat = await memory.fs.stat(path);
        if (path === SPOKE_SKILL && stat) return { ...stat, isSymbolicLink: true };
        return stat;
      },
    };
    const report = await executeSyncPlan(fsWithLink, plan, { backupRoot: BACKUP_ROOT });
    expect(report.results[0]?.reason).toContain('符号链接');
  });
});

describe('hash 复核与幂等', () => {
  it('目标在计划后被修改时跳过', async () => {
    const memory = setup();
    const plan = await planFor(memory);
    memory.files.set(SPOKE_SKILL, content('alpha', '计划后被改'));
    const report = await executeSyncPlan(memory.fs, plan, { backupRoot: BACKUP_ROOT });
    expect(report.results[0]?.status).toBe('skipped');
    expect(report.results[0]?.reason).toContain('目标文件在计划后被修改');
  });

  it('来源在计划后被修改时跳过', async () => {
    const memory = setup();
    const plan = await planFor(memory);
    memory.files.set(HUB_SKILL, content('alpha', 'hub 被改'));
    const report = await executeSyncPlan(memory.fs, plan, { backupRoot: BACKUP_ROOT });
    expect(report.results[0]?.status).toBe('skipped');
    expect(report.results[0]?.reason).toContain('来源文件在计划后被修改');
  });

  it('重复执行同一计划时第二次跳过', async () => {
    const memory = setup();
    const plan = await planFor(memory);
    const first = await executeSyncPlan(memory.fs, plan, { backupRoot: BACKUP_ROOT });
    expect(first.counts.updated).toBe(1);

    const second = await executeSyncPlan(memory.fs, plan, {
      backupRoot: BACKUP_ROOT,
      timestamp: 'second',
    });
    expect(second.results[0]?.status).toBe('skipped');
    expect(second.results[0]?.reason).toContain('已是最新');
  });

  it('锁文件存在时拒绝执行', async () => {
    const memory = setup();
    const plan = await planFor(memory);
    memory.files.set(`${BACKUP_ROOT}/.lock`, 'running');
    await expect(executeSyncPlan(memory.fs, plan, { backupRoot: BACKUP_ROOT })).rejects.toThrow(
      '已有同步任务在执行',
    );
  });
});

describe('备份与结果', () => {
  it('覆盖前备份原文件并写 manifest', async () => {
    const memory = setup();
    const plan = await planFor(memory);
    const report = await executeSyncPlan(memory.fs, plan, {
      backupRoot: BACKUP_ROOT,
      timestamp: '2026-11-25_10-00-00',
    });

    expect(report.counts.updated).toBe(1);
    const backupDir = `${BACKUP_ROOT}/2026-11-25_10-00-00`;
    const manifestRaw = memory.files.get(`${backupDir}/manifest.json`);
    expect(manifestRaw).toBeDefined();
    const manifest = JSON.parse(manifestRaw ?? '{}') as BackupManifest;
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]?.originalPath).toBe(SPOKE_SKILL);
    expect(memory.files.get(manifest.entries[0]!.backupPath)).toContain('旧正文');
  });

  it('新建文件不产生空占位备份', async () => {
    const memory = createMemoryFs({ [HUB_SKILL]: content('alpha', '新正文') });
    const plan = await buildSyncPlan(memory.fs, '/hub', [], {
      targets: [
        {
          id: 'cursor',
          agent: 'cursor',
          root: '/home/dev/.cursor/skills',
          scope: 'global',
          os: 'linux',
        },
      ],
    });
    const report = await executeSyncPlan(memory.fs, plan, {
      backupRoot: BACKUP_ROOT,
      timestamp: 'new-file',
    });

    expect(report.counts.created).toBe(1);
    expect(report.backupDir).toBeUndefined();
    expect(memory.files.has(`${BACKUP_ROOT}/new-file/manifest.json`)).toBe(false);
  });

  it('单条写入失败时其余条目继续', async () => {
    const memory = setup();
    const plan = await planFor(memory);
    const failing: FileSystem = {
      ...memory.fs,
      async writeTextFileAtomic(path, value) {
        if (path === SPOKE_SKILL) throw new Error('EACCES');
        return memory.fs.writeTextFileAtomic(path, value);
      },
    };
    const report = await executeSyncPlan(failing, plan, { backupRoot: BACKUP_ROOT });
    expect(report.counts.failed).toBe(1);
    expect(report.results[0]?.reason).toBe('EACCES');
    expect(memory.files.get(SPOKE_SKILL)).toContain('旧正文');
  });
});

describe('恢复', () => {
  it('全量恢复写回备份内容', async () => {
    const memory = setup();
    const plan = await planFor(memory);
    await executeSyncPlan(memory.fs, plan, { backupRoot: BACKUP_ROOT, timestamp: 'ts1' });

    const manifest = JSON.parse(
      memory.files.get(`${BACKUP_ROOT}/ts1/manifest.json`) ?? '{}',
    ) as BackupManifest;
    const report = await restoreBackup(memory.fs, `${BACKUP_ROOT}/ts1`, manifest);

    expect(report.restored).toBe(1);
    expect(memory.files.get(SPOKE_SKILL)).toContain('旧正文');

    // 恢复前对当前状态做了二次备份
    const preRestore = [...memory.files.keys()].filter((key) => key.includes('/pre-restore/'));
    expect(preRestore.length).toBeGreaterThan(0);
  });

  it('单条恢复只影响指定技能', async () => {
    const memory = setup();
    const plan = await planFor(memory);
    await executeSyncPlan(memory.fs, plan, { backupRoot: BACKUP_ROOT, timestamp: 'ts2' });
    const manifest = JSON.parse(
      memory.files.get(`${BACKUP_ROOT}/ts2/manifest.json`) ?? '{}',
    ) as BackupManifest;

    const report = await restoreBackup(memory.fs, `${BACKUP_ROOT}/ts2`, manifest, {
      skillName: 'not-exist',
    });
    expect(report.restored).toBe(0);
  });
});

describe('prune', () => {
  it('删除前先备份', async () => {
    const memory = setup();
    const result = await pruneSkill(memory.fs, SPOKE_SKILL, { backupRoot: BACKUP_ROOT });
    expect(result.pruned).toBe(true);
    expect(memory.files.has(SPOKE_SKILL)).toBe(false);
    expect(memory.files.get(result.backupPath ?? '')).toContain('旧正文');
  });

  it('文件不存在时不做任何操作', async () => {
    const memory = createMemoryFs();
    const result = await pruneSkill(memory.fs, '/missing/SKILL.md', { backupRoot: BACKUP_ROOT });
    expect(result.pruned).toBe(false);
  });
});