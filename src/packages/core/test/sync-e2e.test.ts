import { existsSync, promises as fsp } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildSyncPlan,
  executeSyncPlan,
  loadPlan,
  restoreBackup,
  savePlan,
  scanInstances,
  type BackupManifest,
  type FileSystem,
  type SkillRecord,
} from '../src/index.js';
import { createNodeFs } from './helpers/node-fs.js';

const content = (body: string): string => `---\nname: alpha\ndescription: alpha\n---\n\n${body}\n`;

let root = '';
let hub = '';
let claude = '';
let cursor = '';
let backupRoot = '';
let writeLog: string[] = [];
let recordingFs: FileSystem;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'manage-skills-sync-e2e-'));
  hub = join(root, 'hub');
  claude = join(root, 'home', '.claude', 'skills');
  cursor = join(root, 'home', '.cursor', 'skills');
  backupRoot = join(root, '.manage-skills', 'backups');

  await fsp.mkdir(join(hub, 'alpha'), { recursive: true });
  await fsp.mkdir(join(claude, 'alpha'), { recursive: true });
  await fsp.mkdir(join(cursor, 'alpha'), { recursive: true });

  await fsp.writeFile(join(hub, 'alpha', 'SKILL.md'), content('新正文'), 'utf8');
  await fsp.writeFile(join(claude, 'alpha', 'SKILL.md'), content('旧正文'), 'utf8');
  await fsp.writeFile(join(cursor, 'alpha', 'SKILL.md'), content('旧正文'), 'utf8');

  const base = createNodeFs();
  recordingFs = {
    ...base,
    async writeTextFileAtomic(path, value) {
      writeLog.push(path);
      await base.writeTextFileAtomic(path, value);
    },
    async mkdirp(path) {
      writeLog.push(path);
      await base.mkdirp(path);
    },
  };
  writeLog = [];
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('端到端同步流程', () => {
  it('plan → 选边 → apply → restore 全链路一致', async () => {
    const instances = [
      { id: 'claude', agent: 'claude-code' as const, root: claude, scope: 'global' as const, os: 'linux' as const },
      { id: 'cursor', agent: 'cursor' as const, root: cursor, scope: 'global' as const, os: 'linux' as const },
    ];
    const records: SkillRecord[] = await scanInstances(recordingFs, instances);
    expect(records).toHaveLength(2);

    // 1. 生成计划（选 hub 为准）
    const plan = await buildSyncPlan(recordingFs, hub, records, {
      selections: { alpha: 'hub' },
      id: 'plan-e2e',
    });
    expect(plan.items).toHaveLength(2);
    expect(plan.counts.update).toBe(2);

    // 2. 保存快照
    const planPath = join(root, '.manage-skills', 'plans', 'plan-e2e.json');
    await savePlan(recordingFs, planPath, plan);
    const loaded = await loadPlan(recordingFs, planPath);
    expect(loaded.plan?.items).toHaveLength(2);

    // 3. 执行
    const report = await executeSyncPlan(recordingFs, plan, {
      backupRoot,
      allowedRoots: [claude, cursor],
      timestamp: 'e2e',
    });
    expect(report.counts.updated).toBe(2);
    expect(report.backupDir).toBe(join(backupRoot, 'e2e'));

    const claudeContent = await fsp.readFile(join(claude, 'alpha', 'SKILL.md'), 'utf8');
    expect(claudeContent).toContain('新正文');

    // 4. 恢复
    const manifest = JSON.parse(
      await fsp.readFile(join(backupRoot, 'e2e', 'manifest.json'), 'utf8'),
    ) as BackupManifest;
    const restored = await restoreBackup(recordingFs, join(backupRoot, 'e2e'), manifest);
    expect(restored.restored).toBe(2);

    const restoredContent = await fsp.readFile(join(claude, 'alpha', 'SKILL.md'), 'utf8');
    expect(restoredContent).toContain('旧正文');

    // 5. 写入都落在临时根目录
    expect(writeLog.length).toBeGreaterThan(0);
    for (const path of writeLog) {
      expect(path.startsWith(root)).toBe(true);
    }

    // 6. 备份与预恢复目录都存在
    expect(existsSync(join(backupRoot, 'e2e', 'manifest.json'))).toBe(true);
    expect(
      writeLog.some((path) => path.includes('pre-restore')),
    ).toBe(true);
  });
});