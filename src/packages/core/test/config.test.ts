import { describe, expect, it } from 'vitest';
import { resolveScanRoots, type AgentInstance, type PlatformEnv } from '../src/index.js';

const baseInstance: AgentInstance = {
  id: 'claude-code:global:/home/dev/.claude/skills',
  agent: 'claude-code',
  root: '/home/dev/.claude/skills',
  scope: 'global',
  os: 'linux',
};

function env(exists: (path: string) => boolean = () => true): PlatformEnv {
  return { platform: 'linux', homedir: '/home/dev', pathExists: exists };
}

describe('resolveScanRoots', () => {
  it('追加用户配置的扫描根', () => {
    const result = resolveScanRoots([baseInstance], { scanRoots: [{ path: '/data/skills' }] }, env());
    expect(result.instances).toHaveLength(2);
    const custom = result.instances[1];
    expect(custom?.scope).toBe('user-config');
    expect(custom?.agent).toBe('custom');
    expect(result.warnings).toEqual([]);
  });

  it('用户配置可指定所属 agent', () => {
    const result = resolveScanRoots(
      [],
      { scanRoots: [{ path: '/data/skills', agent: 'cursor' }] },
      env(),
    );
    expect(result.instances[0]?.agent).toBe('cursor');
  });

  it('路径不存在时告警并继续', () => {
    const result = resolveScanRoots(
      [baseInstance],
      { scanRoots: [{ path: '/missing' }, { path: '/data/skills' }] },
      env((path) => path !== '/missing'),
    );
    expect(result.instances).toHaveLength(2);
    expect(result.warnings).toEqual(['扫描根不存在，已跳过：/missing']);
  });

  it('与内置路径重复的配置项去重', () => {
    const result = resolveScanRoots(
      [baseInstance],
      { scanRoots: [{ path: '/home/dev/.claude/skills' }] },
      env(),
    );
    expect(result.instances).toHaveLength(1);
  });

  it('排除规则按目录前缀过滤', () => {
    const result = resolveScanRoots(
      [baseInstance],
      { exclude: ['/home/dev/.claude'] },
      env(),
    );
    expect(result.instances).toHaveLength(0);
  });

  it('排除规则不影响其他目录', () => {
    const other: AgentInstance = {
      id: 'cursor:global:/home/dev/.cursor/skills',
      agent: 'cursor',
      root: '/home/dev/.cursor/skills',
      scope: 'global',
      os: 'linux',
    };
    const result = resolveScanRoots(
      [baseInstance, other],
      { exclude: ['/home/dev/.claude'] },
      env(),
    );
    expect(result.instances.map((item) => item.agent)).toEqual(['cursor']);
  });
});