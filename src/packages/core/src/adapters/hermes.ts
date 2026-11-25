import type { AgentAdapter, RootSpec } from './types.js';
import { joinPath } from '../utils/path.js';

function profileRootsFor(profilesDir: string, listDir: (dir: string) => string[], os?: RootSpec['os']): RootSpec[] {
  return listDir(profilesDir).map((name) => ({
    path: joinPath(profilesDir, name, 'skills'),
    ...(os ? { os } : {}),
  }));
}

export const hermesAdapter: AgentAdapter = {
  id: 'hermes',
  displayName: 'Hermes',
  supportsCategory: true,
  globalRoots(env) {
    const roots: RootSpec[] = [{ path: joinPath(env.homedir, '.hermes', 'skills') }];
    if (env.windowsHome) {
      roots.push({
        path: joinPath(env.windowsHome, '.hermes', 'skills'),
        os: 'windows-wsl-bridge',
      });
    }
    return roots;
  },
  projectRoots() {
    return [];
  },
  extraRoots(env) {
    const { listDir, pathExists } = env;
    if (!listDir) return [];

    const roots: RootSpec[] = [];
    const profilesDir = joinPath(env.homedir, '.hermes', 'profiles');
    if (pathExists(profilesDir)) {
      roots.push(...profileRootsFor(profilesDir, listDir));
    }
    if (env.windowsHome) {
      const bridgeProfilesDir = joinPath(env.windowsHome, '.hermes', 'profiles');
      if (pathExists(bridgeProfilesDir)) {
        roots.push(...profileRootsFor(bridgeProfilesDir, listDir, 'windows-wsl-bridge'));
      }
    }
    return roots;
  },
};