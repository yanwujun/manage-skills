import { saveIndex } from '../storage/index-store.js';
import type { FileSystem } from '../utils/fs.js';
import type { ManageSkillsIndex, SkillRecord, TagState } from '../types/index.js';

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function stateOf(record: SkillRecord): TagState {
  return record.tagState ?? { added: [], removed: [] };
}

/** 有效标签 = (frontmatter 标签 ∪ added) - removed，统一小写并排序。 */
export function effectiveTags(record: SkillRecord): string[] {
  const state = stateOf(record);
  const removed = new Set(state.removed.map(normalizeTag));
  const result = new Set<string>();
  for (const tag of [...(record.frontmatter.tags ?? []), ...state.added]) {
    const normalized = normalizeTag(tag);
    if (normalized && !removed.has(normalized)) result.add(normalized);
  }
  return [...result].sort();
}

/** 追加标签；同时从 removed 中移除同名标签，保证「加了就是加了」。 */
export function addTags(record: SkillRecord, tags: string[]): SkillRecord {
  const state = stateOf(record);
  const targets = tags.map(normalizeTag).filter(Boolean);
  const added = new Set([...state.added.map(normalizeTag), ...targets]);
  const removed = state.removed
    .map(normalizeTag)
    .filter((tag) => !added.has(tag));
  return { ...record, tagState: { added: [...added].sort(), removed: [...removed].sort() } };
}

/** 移除标签；同时从 added 中移除同名标签。 */
export function removeTags(record: SkillRecord, tags: string[]): SkillRecord {
  const state = stateOf(record);
  const targets = new Set(tags.map(normalizeTag).filter(Boolean));
  const added = state.added.map(normalizeTag).filter((tag) => !targets.has(tag));
  const removed = new Set([...state.removed.map(normalizeTag), ...targets]);
  return { ...record, tagState: { added: [...added].sort(), removed: [...removed].sort() } };
}

/** 按标签筛选（AND 语义）。 */
export function filterByTags(records: SkillRecord[], tags: string[]): SkillRecord[] {
  const required = tags.map(normalizeTag).filter(Boolean);
  if (required.length === 0) return [...records];
  return records.filter((record) => {
    const current = new Set(effectiveTags(record));
    return required.every((tag) => current.has(tag));
  });
}

export interface TagCount {
  tag: string;
  count: number;
}

/** 统计每个标签的技能数，按数量降序、名称升序。 */
export function tagCounts(records: SkillRecord[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const tag of effectiveTags(record)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

const TAG_RULES: ReadonlyArray<{ tag: string; keywords: readonly string[] }> = [
  { tag: 'pdf', keywords: ['pdf'] },
  { tag: 'review', keywords: ['review', 'audit', '审查', '审计'] },
  { tag: 'testing', keywords: ['test', 'e2e', 'unit', '测试', '用例'] },
  { tag: 'database', keywords: ['sql', 'database', 'migrate', '数据库', '迁移'] },
  { tag: 'web', keywords: ['web', 'frontend', 'react', 'css', 'html', '前端'] },
  { tag: 'docs', keywords: ['doc', 'report', '文档', '报告'] },
];

/** 基于名称、描述与目录给出建议标签；建议值不进入有效标签，需用户采纳。 */
export function suggestTags(record: SkillRecord): string[] {
  const text = [record.frontmatter.name, record.frontmatter.description, record.relativePath]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
  return TAG_RULES.filter((rule) => rule.keywords.some((keyword) => text.includes(keyword))).map(
    (rule) => rule.tag,
  );
}

/** 批量打标/移除并持久化到 sidecar，返回更新后的索引。 */
export async function saveTags(
  fs: FileSystem,
  indexPath: string,
  index: ManageSkillsIndex,
  skillPaths: string[],
  options: { add?: string[]; remove?: string[] } = {},
): Promise<ManageSkillsIndex> {
  const targets = new Set(skillPaths);
  const known = new Set(index.skills.map((record) => record.path));
  for (const path of targets) {
    if (!known.has(path)) throw new Error(`索引中不存在该技能：${path}`);
  }

  const add = options.add ?? [];
  const remove = options.remove ?? [];
  const skills = index.skills.map((record) => {
    if (!targets.has(record.path)) return record;
    let next = record;
    if (remove.length > 0) next = removeTags(next, remove);
    if (add.length > 0) next = addTags(next, add);
    return next;
  });

  const next: ManageSkillsIndex = { ...index, skills };
  await saveIndex(fs, indexPath, next);
  return next;
}