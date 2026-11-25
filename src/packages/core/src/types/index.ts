/** Agent 标识：MVP 支持的四家，外加用户自定义扫描根。 */
export type AgentId = 'claude-code' | 'cursor' | 'codex' | 'hermes' | 'custom';

/** 资源类型：技能与指令参与同步，其余只读展示。 */
export type ResourceType = 'skill' | 'command' | 'memory' | 'mcp' | 'hook' | 'subagent';

/** 运行平台。 */
export type SupportedPlatform = 'win32' | 'darwin' | 'linux';

/** 实例来源：本机系统，或 WSL 桥接的 Windows 侧目录。 */
export type InstanceOs = 'windows' | 'macos' | 'linux' | 'wsl' | 'windows-wsl-bridge';

/** 调用方注入的运行环境（core 不直接读系统信息与文件系统）。 */
export interface PlatformEnv {
  platform: SupportedPlatform;
  /** 当前用户主目录（绝对路径） */
  homedir: string;
  /** 是否运行在 WSL 中 */
  isWsl?: boolean;
  /** WSL 场景下探测到的 Windows 用户目录（如 /mnt/c/Users/dev） */
  windowsHome?: string;
  /** 路径是否存在（IO 由调用方注入） */
  pathExists(path: string): boolean;
  /** 列出目录下的子目录名（用于 Hermes profiles 之类需要枚举的场景） */
  listDir?(path: string): string[];
}

/** 一个 agent 实例：某 agent 在某个根目录下的技能集合。 */
export interface AgentInstance {
  id: string;
  agent: AgentId;
  /** 技能根目录的绝对路径 */
  root: string;
  scope: 'global' | 'project' | 'user-config';
  os: InstanceOs;
}

/** 索引条目中记录的状态标记。 */
export type SkillState = 'ok' | 'invalid' | 'stale';

/** 用户在 config.json 中追加的扫描根。 */
export interface ScanRootConfig {
  path: string;
  agent?: AgentId;
  label?: string;
}

/** `~/.manage-skills/config.json` 的结构。 */
export interface ManageSkillsConfig {
  scanRoots?: ScanRootConfig[];
  /** 需要排除的目录前缀（绝对路径） */
  exclude?: string[];
}

/** SKILL.md frontmatter 中会被索引的字段。 */
export interface SkillFrontmatter {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  version?: string;
}

export type SkillStatus = 'ok' | 'invalid';

/** 扫描得到的一条技能记录（索引条目）。 */
export interface SkillRecord {
  /** `${instanceId}:${relativePath}` */
  id: string;
  instanceId: string;
  agent: AgentId;
  /** 实例根目录 */
  root: string;
  /** SKILL.md 的绝对路径 */
  path: string;
  /** 相对实例根目录的路径 */
  relativePath: string;
  hash: string;
  size: number;
  mtimeMs: number;
  frontmatter: SkillFrontmatter;
  status: SkillStatus;
  error?: string;
  /** 手工标签（由 tag-and-similarity 能力维护） */
  tags?: string[];
  /** 分类及其来源（由分类能力维护） */
  category?: {
    value: string;
    source: 'frontmatter' | 'sidecar' | 'suggested';
  };
  /** 源文件已不存在（增量刷新时标记） */
  stale?: boolean;
}

/** `~/.manage-skills/index.json` 的结构。 */
export interface ManageSkillsIndex {
  schemaVersion: number;
  generatedAt: string;
  skills: SkillRecord[];
}