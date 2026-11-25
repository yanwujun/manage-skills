import type { AgentAdapter } from './types.js';
import type { AgentId } from '../types/index.js';
import { claudeCodeAdapter } from './claude-code.js';
import { cursorAdapter } from './cursor.js';
import { codexAdapter } from './codex.js';
import { hermesAdapter } from './hermes.js';

/** 编译期注册表：新增 agent 时在此登记。 */
export const ADAPTERS: readonly AgentAdapter[] = [
  claudeCodeAdapter,
  cursorAdapter,
  codexAdapter,
  hermesAdapter,
];

const byId: Partial<Record<AgentId, AgentAdapter>> = {};
for (const adapter of ADAPTERS) {
  byId[adapter.id] = adapter;
}

export function getAdapter(id: AgentId): AgentAdapter | undefined {
  return byId[id];
}