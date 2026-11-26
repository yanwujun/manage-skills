# Spec Delta

## ADDED Requirements

### Requirement: version-drift 检测

系统 SHALL 检出「内容已变化但 frontmatter version 未变」的技能，并在审计报告中列为 `version-drift`；判定以该路径当前 version 段的第一条历史为基线（同一版本段内内容与基线不同即视为漂移）。扫描摘要与审计报告 SHALL 标出该类条目数量。

#### Scenario: 内容变化但版本未变

- **WHEN** 某技能在当前 version 段内，最新内容 hash 与该段第一条历史不同
- **THEN** 审计报告列出一条 `version-drift`

#### Scenario: 内容与版本同时变化

- **WHEN** 某技能内容 hash 与 version 都相对上一条历史发生变化
- **THEN** 不产生 `version-drift`

#### Scenario: 版本号缺失

- **WHEN** 某技能内容已变化且 frontmatter 没有 version 字段
- **THEN** 审计报告列出一条 `version-drift`，提示补充版本号

#### Scenario: 首次收录不产生漂移

- **WHEN** 某技能尚无历史基线（首次收录）
- **THEN** 不产生 `version-drift`

#### Scenario: 扫描摘要提示数量

- **WHEN** 扫描完成后存在 `version-drift`
- **THEN** 终端摘要显示该数量，提示用户执行版本升号
