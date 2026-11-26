import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizeSegment, type EvalLabel } from '@manage-skills/core';

export interface EvalWorkspace {
  root: string;
  /** 写入 <root>/<label>/.claude/skills/<name>/SKILL.md，返回该版本的工作目录。 */
  create(label: EvalLabel, skillName: string, content: string): Promise<string>;
  /** keep 为 true 时保留目录（便于排查）。 */
  dispose(keep?: boolean): Promise<void>;
}

/** 为每个版本创建独立的临时工作区，避免触碰真实技能目录。 */
export async function createEvalWorkspace(): Promise<EvalWorkspace> {
  const root = await mkdtemp(join(tmpdir(), 'manage-skills-eval-'));

  return {
    root,
    async create(label, skillName, content) {
      const dir = join(root, label, '.claude', 'skills', sanitizeSegment(skillName));
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'SKILL.md'), content, 'utf8');
      return join(root, label);
    },
    async dispose(keep) {
      if (keep) return;
      await rm(root, { recursive: true, force: true });
    },
  };
}