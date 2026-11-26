import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import type { SkillRecord } from '@manage-skills/core';
import { buildConflicts } from '../src/features/conflicts/conflicts';
import { buildSyncQueue } from '../src/features/sync/queue';
import { executeSyncQueue, type SyncFsDeps } from '../src/features/sync/execute';

function createNodeDeps(manageSkillsDir: string): SyncFsDeps {
  return {
    async getManageSkillsDir() {
      return manageSkillsDir;
    },
    async readTextFile(path: string) {
      return readFile(path, 'utf8');
    },
    async statPath(path: string) {
      try {
        const info = await stat(path);
        return {
          size: info.size,
          mtimeMs: info.mtimeMs,
          isDirectory: info.isDirectory(),
          isSymbolicLink: info.isSymbolicLink(),
        };
      } catch {
        return null;
      }
    },
    async createDir(path: string) {
      await mkdir(path, { recursive: true });
    },
    async copyFile(from: string, to: string) {
      await mkdir(dirname(to), { recursive: true });
      const content = await readFile(from, 'utf8');
      await writeFile(to, content, 'utf8');
    },
    async writeTextFileAtomic(path: string, content: string) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf8');
    },
  };
}

describe('desktop end-to-end flow (isolated temp HOME)', () => {
  it('completes scan -> conflict select -> preview -> execute -> restore across 4 agents', async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), 'msk-desktop-e2e-'));
    try {
      const manageSkillsDir = join(fakeHome, '.manage-skills');
      const agents = [
        { id: 'claude-code' as const, dir: join(fakeHome, '.claude', 'skills', 'demo') },
        { id: 'cursor' as const, dir: join(fakeHome, '.cursor', 'skills', 'demo') },
        { id: 'codex' as const, dir: join(fakeHome, '.codex', 'skills', 'demo') },
        { id: 'hermes' as const, dir: join(fakeHome, '.hermes', 'skills', 'demo') },
      ];

      for (const [idx, agent] of agents.entries()) {
        await mkdir(agent.dir, { recursive: true });
        await writeFile(
          join(agent.dir, 'SKILL.md'),
          `---\nname: demo\ndescription: version ${idx}\n---\nbody ${idx}\n`,
          'utf8',
        );
      }

      const skills: SkillRecord[] = agents.map((agent, idx) => ({
        id: `${agent.id}:demo/SKILL.md`,
        instanceId: agent.id,
        agent: agent.id,
        root: dirname(agent.dir),
        path: join(agent.dir, 'SKILL.md'),
        relativePath: 'demo/SKILL.md',
        hash: `h${idx}`,
        size: 50,
        mtimeMs: 1000 + idx,
        frontmatter: { name: 'demo', description: `version ${idx}` },
        status: 'ok',
      }));

      // 1. 冲突分组：4 个实例存在同名不同 hash
      const conflicts = buildConflicts(skills);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]!.sides).toHaveLength(4);

      // 2. 选边（保留 claude-code）并生成同步队列，此时不写盘
      const chosenPath = skills[0]!.path;
      const queue = buildSyncQueue(skills, { demo: chosenPath });
      expect(queue).toHaveLength(3);
      expect(await readFile(skills[1]!.path, 'utf8')).toContain('version 1');

      // 3. 执行同步（备份 -> 原子写）
      const progressCalls: Array<[number, number]> = [];
      const outcome = await executeSyncQueue(
        queue,
        (done, total) => progressCalls.push([done, total]),
        createNodeDeps(manageSkillsDir),
      );
      expect(outcome.summary).toEqual({ created: 0, updated: 3, skipped: 0, failed: 0 });
      expect(progressCalls[progressCalls.length - 1]).toEqual([3, 3]);

      // 4. 验证目标内容已同步为 version 0
      for (const target of skills.slice(1)) {
        expect(await readFile(target.path, 'utf8')).toContain('version 0');
      }

      // 5. 验证 manifest 完整并模拟恢复
      const manifestRaw = await readFile(join(outcome.backupDir, 'manifest.json'), 'utf8');
      const manifest = JSON.parse(manifestRaw) as {
        entries: Array<{ originalPath: string; backupPath: string }>;
      };
      expect(manifest.entries).toHaveLength(3);
      for (const entry of manifest.entries) {
        const backupContent = await readFile(entry.backupPath, 'utf8');
        await writeFile(entry.originalPath, backupContent, 'utf8');
      }
      expect(await readFile(skills[1]!.path, 'utf8')).toContain('version 1');
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
    }
  });
});
