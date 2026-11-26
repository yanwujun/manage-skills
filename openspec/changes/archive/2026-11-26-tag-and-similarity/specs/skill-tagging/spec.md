# Spec Delta

## Purpose

为每个技能提供多维、可自定义的扁平标签，用于筛选、组织与相似度展示，且默认不改动技能源文件。

## ADDED Requirements

### Requirement: 标签来源与优先级

系统 SHALL 以「frontmatter `tags` 为基础、sidecar 手工增减为覆盖、规则建议值为提示」的顺序确定技能的有效标签集合。

#### Scenario: frontmatter 已声明标签

- **WHEN** 技能 frontmatter 含 `tags: [pdf, review]`
- **THEN** 这两个标签出现在该技能的有效标签中

#### Scenario: 手工追加标签

- **WHEN** 用户在 sidecar 为某技能追加标签 `internal`
- **THEN** 有效标签包含 frontmatter 标签与 `internal`，源文件不变

#### Scenario: 手工移除标签

- **WHEN** 用户在 sidecar 移除 frontmatter 中已有的 `review`
- **THEN** 该技能的有效标签不再包含 `review`，但 SKILL.md 内容与 mtime 不变

#### Scenario: 建议标签

- **WHEN** 系统根据目录或关键词推断出标签
- **THEN** 该标签标记为 `suggested`，不计入有效标签，直到用户采纳

### Requirement: 扁平标签命名

系统 SHALL 把标签视为无层级的字符串，统一以小写存储；允许 `domain/testing` 这类前缀约定，但 MUST NOT 解析为层级树。

#### Scenario: 前缀约定

- **WHEN** 用户创建标签 `domain/testing`
- **THEN** 系统按普通字符串保存与筛选，不生成父级 `domain` 节点

#### Scenario: 大小写归一

- **WHEN** 用户输入 `PDF` 与 `pdf`
- **THEN** 系统视为同一标签，计数合并

### Requirement: 打标与批量操作

系统 SHALL 支持对单个或多个技能添加、移除标签，操作只写入 sidecar 索引。

#### Scenario: 批量打标

- **WHEN** 用户选中 10 个技能并添加标签 `legacy`
- **THEN** 10 个技能的有效标签均包含 `legacy`，无任何 SKILL.md 被修改

#### Scenario: 移除不存在的标签

- **WHEN** 用户对某技能移除一个它没有的标签
- **THEN** 操作无副作用并给出提示，不报错

### Requirement: 按标签筛选与计数

系统 SHALL 支持按一个或多个标签筛选技能，并提供每个标签的技能计数；多标签筛选为 AND 语义。

#### Scenario: 单标签筛选

- **WHEN** 用户选择标签 `pdf`
- **THEN** 列表只显示有效标签包含 `pdf` 的技能，并显示计数

#### Scenario: 多标签筛选

- **WHEN** 用户同时选择 `pdf` 与 `internal`
- **THEN** 列表只显示同时具有两个标签的技能

#### Scenario: 标签计数

- **WHEN** 用户查看标签云或标签列表
- **THEN** 每个标签旁显示使用该标签的技能数量

### Requirement: 标签持久化

系统 SHALL 将标签与增减记录持久化到 sidecar，进程重启后保持；源文件被删除时对应标签记录进入 stale 状态而不是消失。

#### Scenario: 重启后保留

- **WHEN** 用户打标后重新启动应用
- **THEN** 标签仍然生效并可用于筛选

#### Scenario: 技能被删除

- **WHEN** 已打标技能的源文件被删除
- **THEN** 该技能条目标记 stale，标签记录保留以供追溯
