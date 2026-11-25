/** sidecar 索引的当前结构版本；结构变化时递增并在读取处迁移。 */
export const SCHEMA_VERSION = 1;

export * from './index-store.js';
export * from './plan-store.js';