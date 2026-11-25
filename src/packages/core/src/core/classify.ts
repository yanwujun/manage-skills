import { saveIndex } from '../storage/index-store.js';
import type { FileSystem } from '../utils/fs.js';
import type { ManageSkillsIndex, SkillRecord } from '../types/index.js';

export type CategorySource = 'frontmatter' | 'sidecar' | 'suggested';

export interface CategoryResolution {
  value: string;
  source: CategorySource;
}

export interface CategoryCount {
  value: string;
  count: number;
}

const KEYWORD_RULES: ReadonlyArray<{ category: string; keywords: readonly string[] }> = [
  { category: 'testing', keywords: ['test', 'e2e', 'unit', 'bench', '测试', '用例'] },
  { category: 'documents', keywords: ['pdf', 'docx', 'report', 'document', '文档', '报告'] },
  { category: 'database', keywords: ['sql', 'database', 'migrate', '数据库', '迁移'] },
  { category: 'review', keywords: ['review', 'audit', 'lint', '审查', '审计'] },
  { category: 'web', keywords: ['web', 'frontend', 'react', 'css', 'html', '前端'] },
];

function haystack(record: SkillRecord): string {
  return [record.frontmatter.name, record.frontmatter.description, record.relativePath]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

/** 基于名称、描述与目录的关键词建议分类。 */
export function suggestCategory(record: SkillRecord): string | undefined {
  const text = haystack(record);
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) return rule.category;
  }
  return undefined;
}

/**
 * 分类优先级：frontmatter > sidecar 标注（或已缓存的建议） > 关键词建议。
 * 返回值中的 source 用于区分「已确认」与「建议」。
 */
export function resolveCategory(record: SkillRecord): CategoryResolution | null {
  const declared = record.frontmatter.category;
  if (declared) return { value: declared, source: 'frontmatter' };
  if (record.category?.value) {
    return { value: record.category.value, source: record.category.source };
  }
  const suggested = suggestCategory(record);
  return suggested ? { value: suggested, source: 'suggested' } : null;
}

/** 设置或清除 sidecar 分类；不触碰源文件。 */
export function setCategory(record: SkillRecord, category: string | null): SkillRecord {
  if (category === null) {
    const next = { ...record };
    delete next.category;
    return next;
  }
  return { ...record, category: { value: category, source: 'sidecar' } };
}

/** 统计各分类的技能数（含建议值，调用方可按 source 过滤）。 */
export function listCategories(index: ManageSkillsIndex): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const record of index.skills) {
    const resolved = resolveCategory(record);
    if (!resolved) continue;
    counts.set(resolved.value, (counts.get(resolved.value) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** 把分类写入 sidecar 索引并持久化，返回更新后的索引。 */
export async function saveCategory(
  fs: FileSystem,
  indexPath: string,
  index: ManageSkillsIndex,
  skillPath: string,
  category: string | null,
): Promise<ManageSkillsIndex> {
  let found = false;
  const skills = index.skills.map((record) => {
    if (record.path !== skillPath) return record;
    found = true;
    return setCategory(record, category);
  });
  if (!found) throw new Error(`索引中不存在该技能：${skillPath}`);

  const next: ManageSkillsIndex = { ...index, skills };
  await saveIndex(fs, indexPath, next);
  return next;
}