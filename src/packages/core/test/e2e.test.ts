import { existsSync, promises as fsp } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildAuditReport,
  buildHubDiff,
  discoverInstances,
  loadIndex,
  mergeScan,
  renderHubDiffJson,
  saveCategory,
  saveIndex,
  scanInstances,
  type FileSystem,
  type PlatformEnv,
} from '../src/index.js';
import { createNodeFs } from './helpers/node-fs.js';

const SKILL = (name: string, description: string, body = '正文内容'): string =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;

let root = '';
let home = '';
let project = '';
let hub = '';
let writeLog: string[] = [];
let recordingFs: FileSystem;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'manage-skills-e2e-'));
  home = join(root, 'home');
  project = join(root, 'project');
  hub = join(root, 'hub');

  const files: Array<[string, string]> = [
    [join(home, '.claude', 'skills', 'pdf-toolkit', 'SKILL.md'), SKILL('pdf-toolkit', 'PDF 工具', '版本 A')],
    [join(home, '.cursor', 'skills', 'pdf-toolkit', 'SKILL.md'), SKILL('pdf-toolkit', 'PDF 工具', '版本 B')],
    [join(home, '.codex', 'skills', 'db-migrate', 'SKILL.md'), SKILL('db-migrate', '数据库迁移')],
    [join(home, '.hermes', 'skills', 'tools', 'web-scraper', 'SKILL.md'), SKILL('web-scraper', '网页抓取')],
    [join(project, '.claude', 'skills', 'project-skill', 'SKILL.md'), SKILL('project-skill', '项目技能')],
    [join(hub, 'skills', 'report-writer', 'SKILL.md'), SKILL('report-writer', '报告生成')],
  ];

  for (const [path, content] of files) {
    await fsp.mkdir(join(path, '..'), { recursive: true });
    await fsp.writeFile(path, content, 'utf8');
  }

  const baseFs = createNodeFs();
  recordingFs = {
    ...baseFs,
    async writeTextFileAtomic(path, content) {
      writeLog.push(path);
      await baseFs.writeTextFileAtomic(path, content);
    },
    async mkdirp(path) {
      writeLog.push(path);
      await baseFs.mkdirp(path);
    },
  };
  writeLog = [];
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('端到端：临时 HOME 四 agent 环境', () => {
  it('scan → 分类 → audit → diff 全链路可用，写入仅落在临时 HOME', async () => {
    const env: PlatformEnv = {
      platform: 'linux',
      homedir: home,
      pathExists: (path) => existsSync(path),
    };

    // 1. 探测 + 扫描
    const instances = discoverInstances(env, { cwd: project });
    expect(instances.length).toBeGreaterThanOrEqual(5);

    const records = await scanInstances(recordingFs, instances);
    expect(records.length).toBeGreaterThanOrEqual(5);

    // 2. 索引落盘
    const indexPath = join(home, '.manage-skills', 'index.json');
    const index = mergeScan(null, records);
    await saveIndex(recordingFs, indexPath, index);
    const loaded = await loadIndex(recordingFs, indexPath);
    expect(loaded.error).toBeUndefined();
    expect(loaded.index?.skills).toHaveLength(records.length);

    // 3. 设置分类（只写 sidecar）
    const target = loaded.index!.skills.find((record) => record.frontmatter.name === 'db-migrate')!;
    const updated = await saveCategory(recordingFs, indexPath, loaded.index!, target.path, 'database');
    expect(updated.skills.find((record) => record.path === target.path)?.category?.value).toBe('database');

    // 4. 审计
    const audit = await buildAuditReport(updated.skills, {
      readText: (path) => recordingFs.readTextFile(path),
    });
    expect(audit.counts.drift).toBeGreaterThanOrEqual(1);
    expect(audit.total).toBeGreaterThan(0);

    // 5. hub 对比
    const diff = await buildHubDiff(recordingFs, hub, updated.skills);
    expect(diff.layout).toBe('skills');
    expect(diff.onlyInHub.map((entry) => entry.skillName)).toContain('report-writer');
    expect(JSON.parse(renderHubDiffJson(diff))).toBeTruthy();

    // 6. 写入只发生在临时 HOME 下
    expect(writeLog.length).toBeGreaterThan(0);
    for (const path of writeLog) {
      expect(path.startsWith(home)).toBe(true);
    }

    // 7. 技能源文件未被修改
    const driftA = await fsp.readFile(
      join(home, '.claude', 'skills', 'pdf-toolkit', 'SKILL.md'),
      'utf8',
    );
    expect(driftA).toContain('版本 A');
  });
});