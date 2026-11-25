import type { AgentAdapter, RootSpec } from './types.js';
import { joinPath } from '../utils/path.js';

export const claudeCodeAdapter: AgentAdapter = {
  id: 'claude-code',
  displayName: 'Claude Code',
  supportsCategory: false,
  globalRoots(env) {
    const roots: RootSpec[] = [{ path: joinPath(env.homedir, '.claude', 'skills') }];
    if (env.windowsHome) {
      roots.push({
        path: joinPath(env.windowsHome, '.claude', 'skills'),
        os: 'windows-wsl-bridge',
      });
    }
    return roots;
  },
  projectRoots() {
    return ['.claude/skills'];
  },
  nonSkillDirs: ['.claude/commands'],
};