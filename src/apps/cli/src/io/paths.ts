import { joinPath } from '@manage-skills/core';

export function manageSkillsDir(home: string): string {
  return joinPath(home, '.manage-skills');
}

export function indexPath(home: string): string {
  return joinPath(home, '.manage-skills', 'index.json');
}

export function configPath(home: string): string {
  return joinPath(home, '.manage-skills', 'config.json');
}

export function hubCacheDir(home: string): string {
  return joinPath(home, '.manage-skills', 'cache', 'hub');
}