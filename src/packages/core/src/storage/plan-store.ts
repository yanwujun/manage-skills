import { dirName } from '../utils/path.js';
import type { FileSystem, FileSystemReader } from '../utils/fs.js';
import type { SyncPlan } from '../core/sync.js';
import { validateSyncPlan } from '../core/sync.js';

export const PLAN_SCHEMA_VERSION = 1;

interface StoredPlan {
  schemaVersion: number;
  plan: SyncPlan;
}

export interface LoadPlanResult {
  plan: SyncPlan | null;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 持久化计划快照，供执行与恢复复用。 */
export async function savePlan(fs: FileSystem, path: string, plan: SyncPlan): Promise<void> {
  const errors = validateSyncPlan(plan);
  if (errors.length > 0) {
    throw new Error(`计划结构不合法：${errors.join('；')}`);
  }
  const stored: StoredPlan = { schemaVersion: PLAN_SCHEMA_VERSION, plan };
  await fs.mkdirp(dirName(path));
  await fs.writeTextFileAtomic(path, `${JSON.stringify(stored, null, 2)}\n`);
}

export async function loadPlan(fs: FileSystemReader, path: string): Promise<LoadPlanResult> {
  const stat = await fs.stat(path);
  if (!stat || !stat.isFile) return { plan: null };

  try {
    const data: unknown = JSON.parse(await fs.readTextFile(path));
    if (!isRecord(data)) return { plan: null, error: '计划快照格式不正确' };
    if (data['schemaVersion'] !== PLAN_SCHEMA_VERSION) {
      return { plan: null, error: `不支持的计划版本：${String(data['schemaVersion'])}` };
    }
    const plan = data['plan'];
    const errors = validateSyncPlan(plan);
    if (errors.length > 0) return { plan: null, error: `计划快照损坏：${errors.join('；')}` };
    return { plan: plan as SyncPlan };
  } catch (error) {
    return {
      plan: null,
      error: `计划读取失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}