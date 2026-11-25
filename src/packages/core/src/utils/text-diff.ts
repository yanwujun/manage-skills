export interface TextDiffStats {
  added: number;
  removed: number;
  changed: number;
}

export interface TextDiffResult {
  stats: TextDiffStats;
  /** 仅当 includeLines 为 true 时包含差异行（默认脱敏时不生成） */
  lines: string[];
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n');
}

/**
 * 按行位置比较两份文本，产出增/删/改统计；
 * 仅在显式要求时输出差异行（前 maxLines 条），默认不携带正文。
 */
export function diffText(
  before: string,
  after: string,
  options: { includeLines?: boolean; maxLines?: number } = {},
): TextDiffResult {
  const left = splitLines(before);
  const right = splitLines(after);
  let added = 0;
  let removed = 0;
  let changed = 0;
  const lines: string[] = [];
  const max = Math.max(left.length, right.length);

  for (let i = 0; i < max; i += 1) {
    const a = left[i];
    const b = right[i];
    if (a === b) continue;

    if (a === undefined) {
      added += 1;
      if (options.includeLines && lines.length < (options.maxLines ?? 40)) lines.push(`+ ${b}`);
    } else if (b === undefined) {
      removed += 1;
      if (options.includeLines && lines.length < (options.maxLines ?? 40)) lines.push(`- ${a}`);
    } else {
      changed += 1;
      if (options.includeLines && lines.length < (options.maxLines ?? 40)) {
        lines.push(`- ${a}`, `+ ${b}`);
      }
    }
  }

  return { stats: { added, removed, changed }, lines };
}