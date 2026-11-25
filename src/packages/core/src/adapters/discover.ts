import { ADAPTERS } from './registry.js';
import { joinPath, normalizePath } from '../utils/path.js';
import type { AgentId, AgentInstance, InstanceOs, PlatformEnv } from '../types/index.js';

export interface DiscoverOptions {
  /** 项目根目录；提供时探测各 agent 的项目级技能目录 */
  cwd?: string;
}

/** 当前运行环境对应的实例来源标记。 */
export function osOf(env: PlatformEnv): InstanceOs {
  if (env.platform === 'win32') return 'windows';
  if (env.platform === 'darwin') return 'macos';
  return env.isWsl ? 'wsl' : 'linux';
}

export function discoverInstances(env: PlatformEnv, options: DiscoverOptions = {}): AgentInstance[] {
  const instances: AgentInstance[] = [];
  const seen = new Set<string>();

  const push = (agent: AgentId, root: string, scope: AgentInstance['scope'], os: InstanceOs): void => {
    const normalized = normalizePath(root);
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    instances.push({ id: `${agent}:${scope}:${key}`, agent, root: normalized, scope, os });
  };

  for (const adapter of ADAPTERS) {
    for (const spec of adapter.globalRoots(env)) {
      if (env.pathExists(spec.path)) {
        push(adapter.id, spec.path, 'global', spec.os ?? osOf(env));
      }
    }

    for (const spec of adapter.extraRoots?.(env) ?? []) {
      if (env.pathExists(spec.path)) {
        push(adapter.id, spec.path, 'global', spec.os ?? osOf(env));
      }
    }

    if (options.cwd) {
      for (const relative of adapter.projectRoots()) {
        const root = joinPath(options.cwd, relative);
        if (env.pathExists(root)) {
          push(adapter.id, root, 'project', osOf(env));
        }
      }
    }
  }

  return instances;
}