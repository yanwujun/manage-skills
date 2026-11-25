import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverInstances, type PlatformEnv } from '../src/index.js';

const FIXTURES = fileURLToPath(new URL('../../../../tests/fixtures/agents/', import.meta.url));

function fixtureEnv(): PlatformEnv {
  return {
    platform: 'linux',
    homedir: resolve(FIXTURES, 'home'),
    pathExists: (path) => existsSync(path),
    listDir: (path) =>
      readdirSync(path, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
  };
}

describe('fixture 布局探测', () => {
  it('从虚构 home 与 project 探测出预期实例', () => {
    const list = discoverInstances(fixtureEnv(), { cwd: resolve(FIXTURES, 'project') });

    expect(list).toHaveLength(8);
    expect(list.map((item) => `${item.agent}:${item.scope}`)).toEqual([
      'claude-code:global',
      'claude-code:project',
      'cursor:global',
      'cursor:project',
      'codex:global',
      'codex:project',
      'hermes:global',
      'hermes:global',
    ]);
  });

  it('Hermes profile 目录被识别为独立实例', () => {
    const list = discoverInstances(fixtureEnv(), { cwd: resolve(FIXTURES, 'project') });
    const profile = list.find((item) => item.root.includes('profiles'));
    const normalized = (profile?.root ?? '').replace(/\\/g, '/');
    expect(normalized.endsWith('/profiles/work/skills')).toBe(true);
  });

  it('Cursor rules 不被当作技能实例', () => {
    const list = discoverInstances(fixtureEnv(), { cwd: resolve(FIXTURES, 'project') });
    expect(list.some((item) => item.root.includes('.cursor/rules'))).toBe(false);
  });

  it('中文路径下的项目技能可被探测', () => {
    const list = discoverInstances(fixtureEnv(), { cwd: resolve(FIXTURES, '中文项目') });
    const project = list.filter((item) => item.scope === 'project');
    expect(project).toHaveLength(1);
    expect(project[0]?.agent).toBe('claude-code');
    expect(project[0]?.root).toContain('中文项目');
  });
});