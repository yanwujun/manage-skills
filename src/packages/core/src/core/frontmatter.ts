import { parse as parseYaml } from 'yaml';
import type { SkillFrontmatter } from '../types/index.js';

export interface ParsedSkillFile {
  frontmatter: SkillFrontmatter;
  body: string;
  status: 'ok' | 'invalid';
  error?: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n?/;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

function normalizeFrontmatter(data: Record<string, unknown>): SkillFrontmatter {
  return {
    name: asString(data['name']),
    description: asString(data['description']),
    category: asString(data['category']),
    tags: asStringArray(data['tags']),
    version: asString(data['version']),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 容错解析 SKILL.md：
 * - 去除 BOM 后必须有 `---` 包裹的 frontmatter；
 * - YAML 损坏或不是映射 → invalid，但不抛异常；
 * - 缺少可选字段不影响有效性。
 */
export function parseSkillFile(content: string): ParsedSkillFile {
  const text = content.replace(/^\uFEFF/, '');
  const match = FRONTMATTER.exec(text);
  if (!match) {
    return { frontmatter: {}, body: text, status: 'invalid', error: 'frontmatter 缺失' };
  }

  const body = text.slice(match[0].length);
  try {
    const data: unknown = parseYaml(match[1] ?? '');
    if (data === null || data === undefined) {
      return { frontmatter: {}, body, status: 'ok' };
    }
    if (typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('frontmatter 不是 YAML 映射');
    }
    return {
      frontmatter: normalizeFrontmatter(data as Record<string, unknown>),
      body,
      status: 'ok',
    };
  } catch (error) {
    return { frontmatter: {}, body, status: 'invalid', error: `YAML 解析失败：${errorMessage(error)}` };
  }
}
