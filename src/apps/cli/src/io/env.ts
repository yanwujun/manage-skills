import { existsSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { joinPath, type PlatformEnv, type SupportedPlatform } from '@manage-skills/core';

const SKIPPED_USERS = new Set(['Public', 'Default', 'All Users', 'Default User']);

/** WSL 场景下猜测 Windows 用户目录（优先含 .claude / .cursor 的目录）。 */
function detectWindowsHome(): string | undefined {
  if (!process.env['WSL_DISTRO_NAME'] && !process.env['WSL_INTEROP']) return undefined;
  const usersDir = '/mnt/c/Users';
  if (!existsSync(usersDir)) return undefined;
  try {
    const names = readdirSync(usersDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !SKIPPED_USERS.has(entry.name))
      .map((entry) => entry.name);
    const preferred = names.find(
      (name) =>
        existsSync(joinPath(usersDir, name, '.claude')) ||
        existsSync(joinPath(usersDir, name, '.cursor')),
    );
    const chosen = preferred ?? names[0];
    return chosen ? joinPath(usersDir, chosen) : undefined;
  } catch {
    return undefined;
  }
}

export function createPlatformEnv(): PlatformEnv {
  const current = platform();
  const platformValue: SupportedPlatform =
    current === 'win32' ? 'win32' : current === 'darwin' ? 'darwin' : 'linux';
  const windowsHome = detectWindowsHome();

  return {
    platform: platformValue,
    homedir: homedir(),
    isWsl: Boolean(process.env['WSL_DISTRO_NAME']),
    ...(windowsHome ? { windowsHome } : {}),
    pathExists: existsSync,
    listDir: (path) =>
      readdirSync(path, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
  };
}