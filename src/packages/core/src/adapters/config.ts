import { osOf } from './discover.js';
import { isUnderPath, normalizePath } from '../utils/path.js';
import type {
  AgentInstance,
  ManageSkillsConfig,
  PlatformEnv,
} from '../types/index.js';

export interface ResolveResult {
  instances: AgentInstance[];
  warnings: string[];
}

/**
 * 合并内置实例与用户配置：
 * - config.scanRoots 追加为 user-config 实例，路径不存在时告警并跳过；
 * - config.exclude 按目录前缀过滤实例；
 * - 与内置路径重复的配置项自动去重。
 */
export function resolveScanRoots(
  base: AgentInstance[],
  config: ManageSkillsConfig,
  env: PlatformEnv,
): ResolveResult {
  const warnings: string[] = [];
  const caseInsensitive = env.platform === 'win32';
  const instances = [...base];
  const seen = new Set(base.map((item) => normalizePath(item.root).toLowerCase()));

  for (const entry of config.scanRoots ?? []) {
    const root = normalizePath(entry.path);
    if (!env.pathExists(root)) {
      warnings.push(`扫描根不存在，已跳过：${entry.path}`);
      continue;
    }
    const key = root.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    instances.push({
      id: `user:${key}`,
      agent: entry.agent ?? 'custom',
      root,
      scope: 'user-config',
      os: osOf(env),
    });
  }

  const exclude = (config.exclude ?? []).map((path) => normalizePath(path));
  const filtered = exclude.length
    ? instances.filter((item) => !exclude.some((ex) => isUnderPath(item.root, ex, caseInsensitive)))
    : instances;

  return { instances: filtered, warnings };
}