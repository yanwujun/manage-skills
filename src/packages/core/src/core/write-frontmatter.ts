import type { FileSystem } from '../utils/fs.js';

export interface FrontmatterWritePlan {
  path: string;
  category: string;
  /** 内容是否会发生变化（已是目标值时为 false） */
  changed: boolean;
  previousContent: string;
  nextContent: string;
}

const FRONTMATTER_BLOCK = /^(\uFEFF?)---\r?\n([\s\S]*?)\r?\n?---\r?\n?/;
const PLAIN_CATEGORY = /^[A-Za-z0-9_./-]+$/;

function formatCategory(value: string): string {
  return PLAIN_CATEGORY.test(value) ? value : JSON.stringify(value);
}

/**
 * 计算把分类写回 SKILL.md frontmatter 后的内容（不写盘）。
 * 已有 frontmatter 时替换/追加 `category` 行；没有 frontmatter 时在文件头新建。
 */
export function planFrontmatterWrite(
  path: string,
  content: string,
  category: string,
): FrontmatterWritePlan {
  const match = FRONTMATTER_BLOCK.exec(content);
  const formatted = formatCategory(category);
  let nextContent: string;

  if (!match) {
    nextContent = `---\ncategory: ${formatted}\n---\n\n${content}`;
  } else {
    const bom = match[1] ?? '';
    const yaml = match[2] ?? '';
    const rest = content.slice(match[0].length);
    const lines = yaml.length > 0 ? yaml.split(/\r?\n/) : [];
    const index = lines.findIndex((line) => /^category\s*:/.test(line));
    if (index >= 0) {
      lines[index] = `category: ${formatted}`;
    } else {
      lines.push(`category: ${formatted}`);
    }
    const block = lines.length > 0 ? `---\n${lines.join('\n')}\n---\n` : '---\n---\n';
    nextContent = `${bom}${block}${rest}`;
  }

  return {
    path,
    category,
    changed: nextContent !== content,
    previousContent: content,
    nextContent,
  };
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