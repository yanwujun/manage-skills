import { describe, expect, it } from 'vitest';
import {
  ADAPTERS,
  claudeCodeAdapter,
  codexAdapter,
  cursorAdapter,
  getAdapter,
  hermesAdapter,
  type PlatformEnv,
} from '../src/index.js';

function env(overrides: Partial<PlatformEnv> = {}): PlatformEnv {
  return {
    platform: 'linux',
    homedir: '/home/dev',
    pathExists: () => true,
    ...overrides,
  };
}

describe('agent adapters', () => {
  it('注册四个 adapter，并可按 id 查找', () => {
    expect(ADAPTERS.map((adapter) => adapter.id)).toEqual([
      'claude-code',
      'cursor',
      'codex',
      'hermes',
    ]);
    expect(getAdapter('hermes')?.displayName).toBe('Hermes');
    expect(getAdapter('custom')).toBeUndefined();
  });

  it('Claude Code：全局与项目级目录', () => {
    expect(claudeCodeAdapter.globalRoots(env())).toEqual([{ path: '/home/dev/.claude/skills' }]);
    expect(claudeCodeAdapter.projectRoots()).toEqual(['.claude/skills']);
  });

  it('Cursor：全局与项目级目录，rules 单独识别', () => {
    expect(cursorAdapter.globalRoots(env())).toEqual([{ path: '/home/dev/.cursor/skills' }]);
    expect(cursorAdapter.projectRoots()).toEqual(['.cursor/skills']);
    expect(cursorAdapter.nonSkillDirs).toContain('.cursor/rules');
  });

  it('Codex：项目级使用 .agents/skills', () => {
    expect(codexAdapter.globalRoots(env())).toEqual([{ path: '/home/dev/.codex/skills' }]);
    expect(codexAdapter.projectRoots()).toEqual(['.agents/skills']);
  });

  it('Hermes：支持 category 且无项目级目录', () => {
    expect(hermesAdapter.supportsCategory).toBe(true);
    expect(hermesAdapter.projectRoots()).toEqual([]);
  });

  it('Hermes：枚举 profiles 下的技能根', () => {
    const roots = hermesAdapter.extraRoots?.(env({ listDir: () => ['work', 'personal'] })) ?? [];
    expect(roots.map((root) => root.path)).toEqual([
      '/home/dev/.hermes/profiles/work/skills',
      '/home/dev/.hermes/profiles/personal/skills',
    ]);
  });

  it('WSL 场景追加 Windows 侧桥接目录', () => {
    const roots = claudeCodeAdapter.globalRoots(
      env({ platform: 'linux', isWsl: true, windowsHome: '/mnt/c/Users/dev' }),
    );
    expect(roots).toHaveLength(2);
    expect(roots[1]).toEqual({
      path: '/mnt/c/Users/dev/.claude/skills',
      os: 'windows-wsl-bridge',
    });
  });

  it('Windows 路径使用反斜杠拼接', () => {
    const roots = claudeCodeAdapter.globalRoots(env({ platform: 'win32', homedir: 'C:\\Users\\dev' }));
    expect(roots[0]?.path).toBe('C:\\Users\\dev\\.claude\\skills');
  });
});