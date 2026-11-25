import type { DiffEntry, DiffSide, HubDiffReport } from '../core/hub.js';

function renderSide(side: DiffSide, label: string): string[] {
  const lines = [
    `- ${label}：hash=${side.hash.slice(0, 12)} size=${side.size} ` +
      `mtime=${new Date(side.mtimeMs).toISOString()}`,
    `  - 路径：${side.path}`,
  ];
  if (side.content !== undefined) {
    lines.push('  ```markdown', ...side.content.split(/\r?\n/).slice(0, 40), '  ```');
  }
  return lines;
}

function renderEntry(entry: DiffEntry): string[] {
  const lines = [`### ${entry.skillName}`, ''];
  if (entry.hub) lines.push(...renderSide(entry.hub, 'hub'));
  for (const spoke of entry.spokes) {
    lines.push(...renderSide(spoke, `${spoke.agent} · ${spoke.instanceId}`));
  }
  lines.push('');
  return lines;
}

const SECTIONS: Array<{ key: keyof HubDiffReport; title: string }> = [
  { key: 'onlyInHub', title: 'only-in-hub（仅在权威库）' },
  { key: 'onlyInSpoke', title: 'only-in-spoke（仅在 agent 实例）' },
  { key: 'drift', title: 'drift（同名不同内容）' },
];

/** 渲染 hub 对比报告；默认不含正文，只有 full 模式才附带内容。 */
export function renderHubDiffMarkdown(report: HubDiffReport): string {
  const lines: string[] = [
    '# Hub 同步差异报告',
    '',
    `生成时间：${report.generatedAt}`,
    `Hub：${report.hubRoot}`,
    `布局：${report.layout === 'skills' ? 'skills/<name>/SKILL.md' : '<name>/SKILL.md'}`,
    `模式：${report.full ? '完整内容' : '脱敏（仅元数据）'}`,
    '',
    '| 类别 | 数量 |',
    '| --- | --- |',
    `| only-in-hub | ${report.counts.onlyInHub} |`,
    `| only-in-spoke | ${report.counts.onlyInSpoke} |`,
    `| drift | ${report.counts.drift} |`,
    `| 合计 | ${report.counts.total} |`,
    '',
  ];

  for (const section of SECTIONS) {
    const entries = report[section.key] as DiffEntry[];
    lines.push(`## ${section.title}（${entries.length}）`, '');
    if (entries.length === 0) {
      lines.push('（无）', '');
      continue;
    }
    for (const entry of entries) {
      lines.push(...renderEntry(entry));
    }
  }

  return `${lines.join('\n')}\n`;
}

/** JSON 输出：字段稳定，可被脚本与 CI 消费。 */
export function renderHubDiffJson(report: HubDiffReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}