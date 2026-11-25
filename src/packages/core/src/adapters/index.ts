import { ADAPTERS } from './registry.js';
import type { AgentId } from '../types/index.js';

export * from './types.js';
export * from './claude-code.js';
export * from './cursor.js';
export * from './codex.js';
export * from './hermes.js';
export * from './registry.js';
export * from './discover.js';
export * from './config.js';

/** MVP 内置的 agent 适配器清单（按展示顺序）。 */
export const REGISTERED_ADAPTERS: readonly AgentId[] = ADAPTERS.map((adapter) => adapter.id);