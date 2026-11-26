import type { SkillRecord } from '@manage-skills/core';

export interface ConflictGroup {
  name: string;
  sides: SkillRecord[];
}

/** 按技能名聚合，内容 hash 不同的组视为同名冲突。 */
export function buildConflicts(skills: SkillRecord[]): ConflictGroup[] {
  const byName = new Map<string, SkillRecord[]>();

  for (const record of skills) {
    if (record.stale) continue;
    const name = record.frontmatter.name ?? record.relativePath;
    const list = byName.get(name);
    if (list) list.push(record);
    else byName.set(name, [record]);
  }

  const groups: ConflictGroup[] = [];
  for (const [name, list] of byName) {
    if (new Set(list.map((record) => record.hash)).size < 2) continue;
    groups.push({
      name,
      sides: [...list].sort((a, b) => a.path.localeCompare(b.path)),
    });
  }

  return groups.sort((a, b) => a.name.localeCompare(b.name));
}