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

export function plansDir(home: string): string {
  return joinPath(home, '.manage-skills', 'plans');
}

export function planPath(home: string, id: string): string {
  return joinPath(home, '.manage-skills', 'plans', `${id}.json`);
}

export function backupsDir(home: string): string {
  return joinPath(home, '.manage-skills', 'backups');
}