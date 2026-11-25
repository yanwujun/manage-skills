import { diffText } from '../utils/text-diff.js';
import { toFindingSide } from '../report/types.js';
import type {
  AuditOptions,
  AuditReport,
  Finding,
  FindingKind,
} from '../report/types.js';
import type { SkillRecord } from '../types/index.js';

const HERMES_DESCRIPTION_LIMIT = 60;

/** 构建审计报告时的 IO 能力（读取技能正文用于 diff 统计），由调用方注入。 */
export interface AuditBuildOptions extends AuditOptions {
  readText?: (path: string) => Promise<string>;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    const list = map.get(groupKey);
    if (list) {
      list.push(item);
    } else {
      map.set(groupKey, [item]);
    }
  }
  return map;
}

function skillName(record: SkillRecord): string {
  return record.frontmatter.name ?? record.relativePath;
}

function emptyCounts(): Record<FindingKind, number> {
  return { drift: 0, dup: 0, invalid: 0, 'name-path-conflict': 0 };
}

async function detectDrift(records: SkillRecord[], options: AuditBuildOptions): Promise<Finding[]> {
  const findings: Finding[] = [];
  const groups = groupBy(records, skillName);

  for (const [name, group] of groups) {
    const byHash = groupBy(group, (record) => record.hash);
    if (byHash.size < 2) continue;

    const sides = [...byHash.values()].map((list) => toFindingSide(list[0]!));
    let diffStats: Finding['evidence']['diffStats'];
    let diffLines: string[] | undefined;

    if (options.readText && sides.length >= 2) {
      try {
        const [left, right] = await Promise.all([
          options.readText(sides[0]!.path),
          options.readText(sides[1]!.path),
        ]);
        const diff = diffText(left, right, {
          includeLines: options.full,
          maxLines: options.maxDiffLines,
        });
        diffStats = diff.stats;
        if (options.full) diffLines = diff.lines;
      } catch {
        // 读取失败时仅给出 hash 信息，不中断审计
      }
    }

    findings.push({
      id: `drift:${name}`,
      kind: 'drift',
      severity: 'warning',
      title: `同名技能内容不一致：${name}`,
      message: `${byHash.size} 个不同版本，涉及 ${group.length} 个实例`,
      sides,
      evidence: { hash: sides[0]?.hash, ...(diffStats ? { diffStats } : {}) },
      suggestion: '对比两侧内容后保留其一，或用分类标注区分用途',
      ...(diffLines ? { diffLines } : {}),
    });
  }

  return findings;
}

function detectDup(records: SkillRecord[]): Finding[] {
  const findings: Finding[] = [];
  const groups = groupBy(
    records.filter((record) => record.hash !== ''),
    (record) => record.hash,
  );

  for (const [hash, group] of groups) {
    const names = new Set(group.map(skillName));
    if (names.size < 2) continue;
    findings.push({
      id: `dup:${hash.slice(0, 12)}`,
      kind: 'dup',
      severity: 'info',
      title: `内容相同但名称不同：${[...names].join(' / ')}`,
      message: `${group.length} 份技能内容完全一致`,
      sides: group.map(toFindingSide),
      evidence: { hash },
      suggestion: '保留一份作为权威版本，其余可标记为重复',
    });
  }

  return findings;
}

function detectInvalid(records: SkillRecord[]): Finding[] {
  const findings: Finding[] = [];

  for (const record of records) {
    if (record.status === 'invalid') {
      findings.push({
        id: `invalid:${record.path}`,
        kind: 'invalid',
        severity: 'error',
        title: `技能无法解析：${skillName(record)}`,
        message: record.error ?? 'frontmatter 解析失败',
        sides: [toFindingSide(record)],
        evidence: {
          agent: record.agent,
          instanceId: record.instanceId,
          ...(record.error ? { reason: record.error } : {}),
        },
        suggestion: '补齐或修复 frontmatter 后重新扫描',
      });
    }

    if (record.agent === 'hermes') {
      const description = record.frontmatter.description ?? '';
      if (description.length > HERMES_DESCRIPTION_LIMIT) {
        findings.push({
          id: `invalid:hermes-description:${record.path}`,
          kind: 'invalid',
          severity: 'warning',
          title: `Hermes description 超长：${skillName(record)}`,
          message: `${description.length} 字符，超过 ${HERMES_DESCRIPTION_LIMIT} 字符上限`,
          sides: [toFindingSide(record)],
          evidence: {
            agent: 'hermes',
            instanceId: record.instanceId,
            reason: `description ${description.length} 字符`,
          },
          suggestion: '把详细说明移到正文，把 description 控制在 60 字符以内',
        });
      }
    }
  }

  return findings;
}

function detectNamePathConflict(records: SkillRecord[]): Finding[] {
  const findings: Finding[] = [];
  const groups = groupBy(records, (record) => `${record.agent}|${record.relativePath}`);

  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const names = new Set(group.map(skillName));
    if (names.size > 1) continue;

    const [agent, ...rest] = key.split('|');
    findings.push({
      id: `conflict:${key}`,
      kind: 'name-path-conflict',
      severity: 'error',
      title: `同 agent 内重名重路径：${[...names][0]}`,
      message: `${group.length} 份同名技能位于同一相对路径，可能有一份无法加载`,
      sides: group.map(toFindingSide),
      evidence: { agent: agent as SkillRecord['agent'], relativePath: rest.join('|') },
      suggestion: '重命名其中一份，或确认哪一份应当被加载',
    });
  }

  return findings;
}

export async function buildAuditReport(
  records: SkillRecord[],
  options: AuditBuildOptions = {},
): Promise<AuditReport> {
  const findings = [
    ...(await detectDrift(records, options)),
    ...detectDup(records),
    ...detectInvalid(records),
    ...detectNamePathConflict(records),
  ];

  const counts = emptyCounts();
  for (const finding of findings) {
    counts[finding.kind] += 1;
  }

  const syncable = counts.drift + counts.dup;
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    total: findings.length,
    counts,
    findings,
    syncHint:
      syncable > 0
        ? `检测到 ${syncable} 处可同步项，后续版本将支持从报告直接生成同步计划`
        : '未检测到可同步项',
    full: options.full ?? false,
  };
}