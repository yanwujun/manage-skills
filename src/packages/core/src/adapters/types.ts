import type { AgentId, InstanceOs, PlatformEnv } from '../types/index.js';

/** 一个技能根目录及其来源标记。 */
export interface RootSpec {
  path: string;
  /** 覆盖默认 os 标记（如 WSL 桥接的 Windows 侧目录） */
  os?: InstanceOs;
}

/** 各 agent 的目录与格式差异在此声明，引擎不硬编码任何路径。 */
export interface AgentAdapter {
  id: AgentId;
  displayName: string;
  /** 是否原生支持 frontmatter `category`（Hermes） */
  supportsCategory: boolean;
  /** 全局技能根（含 WSL 桥接的 Windows 侧目录） */
  globalRoots(env: PlatformEnv): RootSpec[];
  /** 项目级技能根，返回相对项目根目录的路径 */
  projectRoots(): string[];
  /** 需要额外枚举的技能根（如 Hermes profiles） */
  extraRoots?(env: PlatformEnv): RootSpec[];
  /** 被识别但不计入技能统计的目录（如 Cursor rules），返回相对路径 */
  nonSkillDirs?: string[];
}