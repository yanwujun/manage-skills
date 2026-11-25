# Spec Delta

## Purpose

为盘点到的大量技能建立稳定、可解释的分类体系，同时保证默认情况下不改动任何源文件。

## ADDED Requirements

### Requirement: 分类来源优先级

系统 SHALL 按固定优先级确定每个技能的分类：frontmatter 已有 category > sidecar 手工标注 > 基于目录与关键词的建议值。

#### Scenario: frontmatter 已有分类

- **WHEN** 技能 frontmatter 已声明 category
- **THEN** 该值作为最终分类，且不被 sidecar 标注覆盖

#### Scenario: 仅存在手工标注

- **WHEN** frontmatter 无 category，但 sidecar 中已有用户手工标注
- **THEN** 使用手工标注值

#### Scenario: 仅有建议值

- **WHEN** 既无 frontmatter category 也无手工标注
- **THEN** 系统给出建议分类并标记为 `suggested`，不视为已生效分类

### Requirement: 手工分类写入 sidecar

系统 SHALL 提供 `classify set <skill> --category <cat>`，仅将分类写入 sidecar 索引，不触碰源文件。

#### Scenario: 设置分类

- **WHEN** 用户执行 `classify set my-skill --category testing`
- **THEN** sidecar 中该技能的 category 更新为 testing，SKILL.md 内容与 mtime 不变

#### Scenario: 索引重启后保留

- **WHEN** 用户设置分类后重新启动进程再执行 `classify` 查看
- **THEN** 手工标注依然存在

### Requirement: 显式回写 frontmatter

系统 SHALL 仅在用户显式使用 `--write-frontmatter` 时把 sidecar 分类写回 SKILL.md，并在写入前完成 dry-run 预览与 `.bak` 备份。

#### Scenario: dry-run 预览

- **WHEN** 用户带 `--write-frontmatter` 且未关闭 dry-run
- **THEN** 系统展示将要发生的文件改动，不实际写入

#### Scenario: 实际写入与备份

- **WHEN** 用户确认写入
- **THEN** SKILL.md 写入新分类，且原文件已保存为 `.bak`，可由该备份回滚

#### Scenario: 默认不写源文件

- **WHEN** 用户执行 `classify` 但未指定 `--write-frontmatter`
- **THEN** 任何 SKILL.md 都不被修改

### Requirement: 建议值不自动生效

系统 SHALL 把自动推断的分类标记为 `suggested`，不得在未经用户确认的情况下作为生效分类参与后续决策。

#### Scenario: 建议分类展示

- **WHEN** 用户查看分类报告
- **THEN** 建议值与已确认分类在输出中可区分

#### Scenario: 用户采纳建议

- **WHEN** 用户对建议值执行 `classify set`
- **THEN** 该分类转为手工标注并去除 `suggested` 标记
