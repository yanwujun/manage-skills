import type { AgentAdapter, RootSpec } from './types.js';
import { joinPath } from '../utils/path.js';

export const codexAdapter: AgentAdapter = {
  id: 'codex',
  displayName: 'Codex',
  supportsCategory: false,
  globalRoots(env) {
    const roots: RootSpec[] = [{ path: joinPath(env.homedir, '.codex', 'skills') }];
    if (env.windowsHome) {
      roots.push({
        path: joinPath(env.windowsHome, '.codex', 'skills'),
        os: 'windows-wsl-bridge',
      });
    }
    return roots;
  },
  projectRoots() {
    return ['.agents/skills'];
  },
};