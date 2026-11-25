# Spec Delta

## Purpose

把本机分散在各 agent 实例中的技能盘点成一份可查询、可增量刷新、可被后续命令复用的清单索引。

## ADDED Requirements

### Requirement: frontmatter 容错解析

系统 SHALL 解析每个 SKILL.md 的 YAML frontmatter，提取 name、description、category、tags、version；解析失败 MUST NOT 使扫描崩溃。

#### Scenario: 正常 frontmatter

- **WHEN** 技能文件的 frontmatter 合法且包含 name 与 description
- **THEN** 系统记录这些字段并纳入正常技能清单

#### Scenario: frontmatter 缺失或 YAML 损坏

- **WHEN** 技能文件没有 frontmatter，或 frontmatter 不是合法 YAML
- **THEN** 系统将该技能标记为 `invalid` 并单独列出，扫描继续

#### Scenario: 缺少可选字段

- **WHEN** frontmatter 仅有 name，缺少 category / tags / version
- **THEN** 系统正常收录，缺失字段留空，不判为 invalid

### Requirement: 全量扫描与摘要输出

系统 SHALL 在一次 `scan` 中遍历全部已探测实例，并在终端输出摘要表（实例、技能数、invalid 数、耗时）。

#### Scenario: 规模化扫描

- **WHEN** 用户在本机约 500 份技能、4 个 agent、WSL 与 Windows 双 OS 环境执行一次 `scan`
- **THEN** 扫描在 30 秒内完成且不崩溃

#### Scenario: 无任何 agent 环境

- **WHEN** 机器上不存在任何已支持 agent 的目录
- **THEN** 系统输出「未发现」的友好提示并正常退出，不以错误码失败

### Requirement: 中央 sidecar 索引

系统 SHALL 把扫描结果持久化到 `~/.manage-skills/index.json`，以「路径 + 内容 hash」关联源文件，记录清单、hash、mtime、分类与标注。

#### Scenario: 首次扫描建立索引

- **WHEN** 用户首次执行 `scan`
- **THEN** 系统创建 `~/.manage-skills/index.json` 并写入全部技能条目

#### Scenario: 索引写入失败

- **WHEN** 索引文件无法写入（如磁盘只读或权限不足）
- **THEN** 系统报告明确错误并保留终端摘要输出

### Requirement: 增量刷新与失效标记

系统 SHALL 在重复扫描时按 hash 与 mtime 增量更新索引，并对源文件已不存在的条目标记 `stale`。

#### Scenario: 文件内容变更

- **WHEN** 某技能文件内容变化后再次执行 `scan`
- **THEN** 该条目 hash 与 mtime 更新，分类与手工标注保留

#### Scenario: 文件被删除

- **WHEN** 索引中的技能源文件已不存在
- **THEN** 该条目被标记 `stale`，不静默丢弃

### Requirement: 只读默认

系统 SHALL 在扫描与索引过程中不改动任何用户技能文件。

#### Scenario: 扫描不写源文件

- **WHEN** 用户执行 `scan`
- **THEN** 所有 SKILL.md 的 mtime 与内容保持不变

#### Scenario: 写入范围受限

- **WHEN** 系统需要持久化任何数据
- **THEN** 写入仅发生在 `~/.manage-skills/` 目录内
