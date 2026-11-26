import type { AgentId, SkillRecord } from '../types/index.js';
import type { TextDiffStats } from '../utils/text-diff.js';

export type FindingKind =
  | 'drift'
  | 'dup'
  | 'invalid'
  | 'name-path-conflict'
  | 'similar'
  | 'version-drift';

export type FindingSeverity = 'error' | 'warning' | 'info';

/** 参与对比的一侧技能（只含元数据，不含正文）。 */
export interface FindingSide {
  skillName: string;
  agent: AgentId;
  instanceId: string;
  root: string;
  path: string;
  relativePath: string;
  hash: string;
  mtimeMs: number;
  size: number;
}

export interface FindingEvidence {
  hash?: string;
  mtimeMs?: number;
  size?: number;
  agent?: AgentId;
  instanceId?: string;
  /** 同 agent 内相对路径冲突 */
  relativePath?: string;
  /** 解析失败原因等 */
  reason?: string;
  /** 内容差异统计（默认脱敏，不含差异行） */
  diffStats?: TextDiffStats;
  /** 版本历史基线 hash（仅 version-drift） */
  previousHash?: string;
  /** 当前 frontmatter version（仅 version-drift） */
  version?: string;
  /** 历史基线中的 version（仅 version-drift） */
  previousVersion?: string;
  /** 相似组信息（仅 similar 类别） */
  similarity?: {
    score: number;
    chained: boolean;
  };
}

export interface Finding {
  id: string;
  kind: FindingKind;
  severity: FindingSeverity;
  title: string;
  message: string;
  sides: FindingSide[];
  evidence: FindingEvidence;
  suggestion: string;
  /** 仅在 full 模式附带差异行 */
  diffLines?: string[];
}

export interface AuditReport {
  generatedAt: string;
  total: number;
  counts: Record<FindingKind, number>;
  findings: Finding[];
  /** 为后续同步能力预留的引导文案 */
  syncHint: string;
  /** 是否包含差异行（默认 false） */
  full: boolean;
}

export interface AuditOptions {
  /** 附带差异行（默认 false，只给统计） */
  full?: boolean;
  /** 单条差异最多输出行数 */
  maxDiffLines?: number;
  now?: Date;
}

export function toFindingSide(record: SkillRecord): FindingSide {
  return {
    skillName: record.frontmatter.name ?? record.relativePath,
    agent: record.agent,
    instanceId: record.instanceId,
    root: record.root,
    path: record.path,
    relativePath: record.relativePath,
    hash: record.hash,
    mtimeMs: record.mtimeMs,
    size: record.size,
  };
}