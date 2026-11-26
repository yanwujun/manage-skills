import { joinPath } from '../utils/path.js';
import type { FileSystem, FileSystemReader } from '../utils/fs.js';
import type { EvalResult } from '../core/eval.js';

/** 把技能名/运行 id 变成安全的目录或文件名片段。 */
export function sanitizeSegment(value: string): string {
  const clean = value.replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '');
  return clean || 'unnamed';
}

export function evalResultPath(dir: string, skill: string, runId: string): string {
  return joinPath(dir, sanitizeSegment(skill), `${sanitizeSegment(runId)}.json`);
}

/** 写入一次评测结果，返回落盘路径。 */
export async function saveEvalResult(
  fs: FileSystem,
  dir: string,
  result: EvalResult,
): Promise<string> {
  const path = evalResultPath(dir, result.skill, result.runId);
  await fs.mkdirp(joinPath(dir, sanitizeSegment(result.skill)));
  await fs.writeTextFileAtomic(path, `${JSON.stringify(result, null, 2)}\n`);
  return path;
}

function isEvalResult(value: unknown): value is EvalResult {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  const to = data['to'];
  return (
    typeof data['runId'] === 'string' &&
    typeof data['skill'] === 'string' &&
    typeof data['finishedAt'] === 'string' &&
    Array.isArray(data['results']) &&
    typeof data['summary'] === 'object' &&
    data['summary'] !== null &&
    typeof to === 'object' &&
    to !== null &&
    typeof (to as Record<string, unknown>)['hash'] === 'string'
  );
}

async function collectResults(
  fs: FileSystemReader,
  dir: string,
  depth: number,
  out: EvalResult[],
): Promise<void> {
  if (depth > 4) return;
  let entries;
  try {
    entries = await fs.readDir(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const child = joinPath(dir, entry.name);
    if (entry.isDirectory) {
      await collectResults(fs, child, depth + 1, out);
      continue;
    }
    if (!entry.isFile || !entry.name.endsWith('.json')) continue;
    try {
      const parsed: unknown = JSON.parse(await fs.readTextFile(child));
      if (isEvalResult(parsed)) out.push(parsed);
    } catch {
      // 损坏的结果文件跳过
    }
  }
}

/** 读取全部评测结果（用于历史视图关联与用例可比性检查）。 */
export async function loadEvalResults(
  fs: FileSystemReader,
  dir: string,
): Promise<EvalResult[]> {
  const out: EvalResult[] = [];
  await collectResults(fs, dir, 0, out);
  return out.sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
}