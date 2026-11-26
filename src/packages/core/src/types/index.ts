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

/** 评测执行器配置：命令 + 固定参数，用例提示作为最后一个参数追加。 */
export interface EvalRunnerConfig {
  command?: string;
  args?: string[];
}

/** `~/.manage-skills/config.json` 的结构。 */
export interface ManageSkillsConfig {
  scanRoots?: ScanRootConfig[];
  /** 需要排除的目录前缀（绝对路径） */
  exclude?: string[];
  /** 评测时拉起的外部 agent CLI（缺省 claude -p --output-format json） */
  evalRunner?: EvalRunnerConfig;
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

/** 手工标签的增量记录：有效标签 = (frontmatter 标签 ∪ added) - removed。 */
export interface TagState {
  added: string[];
  removed: string[];
}

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
  /** 手工标签增量（由 tag-and-similarity 能力维护） */
  tagState?: TagState;
  /** 分类及其来源（由分类能力维护） */
  category?: {
    value: string;
    source: 'frontmatter' | 'sidecar' | 'suggested';
  };
  /** 源文件已不存在（增量刷新时标记） */
  stale?: boolean;
  /** 落地方式为符号链接 */
  link?: 'symlink';
  /** 符号链接指向的目标不存在 */
  linkBroken?: boolean;
}

/** `~/.manage-skills/index.json` 的结构。 */
export interface ManageSkillsIndex {
  schemaVersion: number;
  generatedAt: string;
  skills: SkillRecord[];
}

/** 版本历史的变更来源。 */
export type HistoryCause = 'scan' | 'sync' | 'bump';

/** 一条技能版本历史记录（只含事实元数据，正文另存为内容寻址快照）。 */
export interface HistoryEntry {
  /** SKILL.md 绝对路径（历史的事实主键） */
  path: string;
  instanceId?: string;
  agent: AgentId;
  /** frontmatter name，用于按名称聚合 */
  name?: string;
  /** 内容 sha256，同时是快照 id */
  hash: string;
  size: number;
  mtimeMs: number;
  version?: string;
  cause: HistoryCause;
  note?: string;
  recordedAt: string;
}

/** 版本升号的递增位。 */
export type VersionBumpKind = 'patch' | 'minor' | 'major';