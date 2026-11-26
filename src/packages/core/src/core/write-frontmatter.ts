import type { FileSystem } from '../utils/fs.js';

export interface FrontmatterWritePlan {
  path: string;
  /** 要改写的字段名 */
  field: string;
  /** 目标值（已按需加引号） */
  value: string;
  /** 内容是否会发生变化（已是目标值时为 false） */
  changed: boolean;
  previousContent: string;
  nextContent: string;
}

const FRONTMATTER_BLOCK = /^(\uFEFF?)---\r?\n([\s\S]*?)\r?\n?---\r?\n?/;
const PLAIN_VALUE = /^[A-Za-z0-9_./-]+$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;

function formatValue(value: string): string {
  return PLAIN_VALUE.test(value) ? value : JSON.stringify(value);
}

/**
 * 计算把某个 frontmatter 字段写回 SKILL.md 后的内容（不写盘）。
 * 已有 frontmatter 时替换/追加该字段行；没有 frontmatter 时在文件头新建。
 */
export function planFrontmatterFieldWrite(
  path: string,
  content: string,
  field: string,
  value: string,
): FrontmatterWritePlan {
  if (!FIELD_NAME.test(field)) {
    throw new Error(`不支持的 frontmatter 字段名：${field}`);
  }

  const match = FRONTMATTER_BLOCK.exec(content);
  const formatted = formatValue(value);
  const linePattern = new RegExp(`^${field}\\s*:`);
  let nextContent: string;

  if (!match) {
    nextContent = `---\n${field}: ${formatted}\n---\n\n${content}`;
  } else {
    const bom = match[1] ?? '';
    const yaml = match[2] ?? '';
    const rest = content.slice(match[0].length);
    const lines = yaml.length > 0 ? yaml.split(/\r?\n/) : [];
    const index = lines.findIndex((line) => linePattern.test(line));
    if (index >= 0) {
      lines[index] = `${field}: ${formatted}`;
    } else {
      lines.push(`${field}: ${formatted}`);
    }
    const block = lines.length > 0 ? `---\n${lines.join('\n')}\n---\n` : '---\n---\n';
    nextContent = `${bom}${block}${rest}`;
  }

  return {
    path,
    field,
    value: formatted,
    changed: nextContent !== content,
    previousContent: content,
    nextContent,
  };
}

/** 兼容旧入口：把分类写回 frontmatter。 */
export function planFrontmatterWrite(
  path: string,
  content: string,
  category: string,
): FrontmatterWritePlan {
  return planFrontmatterFieldWrite(path, content, 'category', category);
}

/**
 * 执行回写：dry-run 只返回计划；实际写入前校验文件未被改动，
 * 先写 `.bak` 备份再原子替换源文件。
 */
export async function applyFrontmatterWrite(
  fs: FileSystem,
  plan: FrontmatterWritePlan,
  options: { dryRun?: boolean } = {},
): Promise<{ written: boolean; backupPath?: string }> {
  if (!plan.changed || options.dryRun) return { written: false };

  const current = await fs.readTextFile(plan.path);
  if (current !== plan.previousContent) {
    throw new Error('文件在预览后被修改，已中止写入；请重新生成预览');
  }

  const backupPath = `${plan.path}.bak`;
  await fs.writeTextFileAtomic(backupPath, plan.previousContent);
  await fs.writeTextFileAtomic(plan.path, plan.nextContent);
  return { written: true, backupPath };
}