import { describe, expect, it } from 'vitest';
import { discoverInstances, type PlatformEnv } from '../src/index.js';

const existsAll = (): boolean => true;

function linuxEnv(overrides: Partial<PlatformEnv> = {}): PlatformEnv {
  return { platform: 'linux', homedir: '/home/dev', pathExists: existsAll, ...overrides };
}

describe('discoverInstances', () => {
  it('Windows 环境：os 标记为 windows，路径为反斜杠', () => {
    const list = discoverInstances({ platform: 'win32', homedir: 'C:\\Users\\dev', pathExists: existsAll });
    expect(list).toHaveLength(4);
    expect(list.every((item) => item.os === 'windows')).toBe(true);
    expect(list.find((item) => item.agent === 'claude-code')?.root).toBe(
      'C:\\Users\\dev\\.claude\\skills',
    );
  });

  it('macOS 环境：os 标记为 macos', () => {
    const list = discoverInstances({ platform: 'darwin', homedir: '/Users/dev', pathExists: existsAll });
    expect(list.every((item) => item.os === 'macos')).toBe(true);
  });

  it('Linux 环境：os 标记为 linux', () => {
    const list = discoverInstances(linuxEnv());
    expect(list.every((item) => item.os === 'linux')).toBe(true);
  });

  it('WSL 环境：本机实例标记 wsl，Windows 侧目录标记 windows-wsl-bridge', () => {
    const list = discoverInstances(
      linuxEnv({ isWsl: true, windowsHome: '/mnt/c/Users/dev' }),
    );
    expect(list.filter((item) => item.os === 'wsl')).toHaveLength(4);
    expect(list.filter((item) => item.os === 'windows-wsl-bridge')).toHaveLength(4);
  });

  it('只登记实际存在的目录', () => {
    const list = discoverInstances(linuxEnv({ pathExists: (path) => path.includes('.claude') }));
    expect(list).toHaveLength(1);
    expect(list[0]?.agent).toBe('claude-code');
  });

  it('提供 cwd 时探测项目级目录（Codex 为 .agents/skills）', () => {
    const list = discoverInstances(linuxEnv(), { cwd: '/repo' });
    const project = list.filter((item) => item.scope === 'project');
    expect(project.map((item) => item.agent)).toEqual(['claude-code', 'cursor', 'codex']);
    expect(project.find((item) => item.agent === 'codex')?.root).toBe('/repo/.agents/skills');
  });

  it('同一路径只登记一次', () => {
    const list = discoverInstances(linuxEnv(), { cwd: '/home/dev' });
    const roots = list.map((item) => item.root);
    expect(new Set(roots).size).toBe(roots.length);
  });
});