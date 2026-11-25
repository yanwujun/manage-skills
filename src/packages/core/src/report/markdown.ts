import type { AuditReport, Finding } from './types.js';

const KIND_ORDER: Finding['kind'][] = ['invalid', 'name-path-conflict', 'drift', 'similar', 'dup'];

function renderFinding(finding: Finding): string[] {
  const lines: string[] = [
    `## [${finding.kind}] ${finding.title}`,
    '',
    finding.message,
    '',
  ];

  for (const side of finding.sides) {
    lines.push(
      `- ${side.skillName}（${side.agent} · ${side.instanceId}）` +
        ` hash=${side.hash.slice(0, 12)} size=${side.size} mtime=${new Date(side.mtimeMs).toISOString()}`,
    );
    lines.push(`  - 路径：${side.path}`);
  }

  if (finding.evidence.diffStats) {
    const { added, removed, changed } = finding.evidence.diffStats;
    lines.push(`- 差异统计：+${added} -${removed} ~${changed}`);
  }
  if (finding.evidence.similarity) {
    const { score, chained } = finding.evidence.similarity;
    lines.push(
      `- 相似度：${(score * 100).toFixed(0)}%${chained ? '（组内非全互连）' : ''}`,
    );
  }
  if (finding.evidence.reason) {
    lines.push(`- 原因：${finding.evidence.reason}`);
  }

  if (finding.diffLines && finding.diffLines.length > 0) {
    lines.push('', '```diff', ...finding.diffLines, '```');
  }

  lines.push('', `建议：${finding.suggestion}`, '');
  return lines;
}

/** 渲染审计报告（默认不含技能正文；只有 full 模式下 build 才附带差异行）。 */
export function renderAuditMarkdown(report: AuditReport): string {
  const sorted = [...report.findings].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title),
  );

  const lines: string[] = [
    '# 技能审计报告',
    '',
    `生成时间：${report.generatedAt}`,
    `总计：${report.total} 项`,
    '',
    '| 类型 | 数量 |',
    '| --- | --- |',
    ...KIND_ORDER.map((kind) => `| ${kind} | ${report.counts[kind]} |`),
    '',
  ];

  for (const finding of sorted) {
    lines.push(...renderFinding(finding));
  }

  lines.push(`> ${report.syncHint}`);
  return `${lines.join('\n')}\n`;
}