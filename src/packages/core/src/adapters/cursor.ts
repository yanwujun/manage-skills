import type { AgentAdapter, RootSpec } from './types.js';
import { joinPath } from '../utils/path.js';

export const cursorAdapter: AgentAdapter = {
  id: 'cursor',
  displayName: 'Cursor',
  supportsCategory: false,
  globalRoots(env) {
    const roots: RootSpec[] = [{ path: joinPath(env.homedir, '.cursor', 'skills') }];
    if (env.windowsHome) {
      roots.push({
        path: joinPath(env.windowsHome, '.cursor', 'skills'),
        os: 'windows-wsl-bridge',
      });
    }
    return roots;
  },
  projectRoots() {
    return ['.cursor/skills'];
  },
  nonSkillDirs: ['.cursor/rules'],
};