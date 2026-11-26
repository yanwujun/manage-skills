# resource-catalog Specification

## Purpose
把散落在各 agent 实例中的六类资源变成可浏览、可筛选、状态可辨的目录视图，让用户一眼看清自己有哪些资产、哪些需要处理。

## Requirements

### Requirement: 六类资源总览

系统 SHALL 在主导航中展示技能、指令、记忆、MCP、Hooks、子代理六类资源及各自数量，并支持进入分类列表。

#### Scenario: 应用首页

- **WHEN** 用户打开应用并完成加载
- **THEN** 导航显示六类资源及计数，默认进入技能列表

#### Scenario: 某类资源为空

- **WHEN** 某一类资源在本机不存在
- **THEN** 该导航项显示 0 并可进入空状态页，不隐藏入口

### Requirement: 技能卡片列表

系统 SHALL 以卡片列表展示技能，包含名称、描述、来源 agent 与实例、状态标记与落地方式。

#### Scenario: 列表字段完整

- **WHEN** 用户浏览技能列表
- **THEN** 每张卡片可看到名称、描述摘要、来源、状态标记（如有）与 copy/symlink 标记

#### Scenario: 长描述截断

- **WHEN** 技能描述超过卡片宽度
- **THEN** 卡片内截断显示，详情视图可看全文

### Requirement: 搜索与筛选

系统 SHALL 支持按名称/描述关键词搜索，并按来源 agent、来源实例、状态、分类进行筛选，筛选结果实时更新。

#### Scenario: 关键词搜索

- **WHEN** 用户输入关键词
- **THEN** 列表只显示名称或描述匹配的技能，并显示结果数量

#### Scenario: 组合筛选

- **WHEN** 用户同时选择来源 Claude Code 与状态 drift
- **THEN** 列表显示同时满足两个条件的技能

### Requirement: 非同步类型只读

系统 SHALL 允许浏览记忆、MCP、Hooks、子代理四类资源，MUST NOT 提供编辑或同步入口，并明确标识「仅供查看」。

#### Scenario: 查看 MCP 配置

- **WHEN** 用户进入 MCP 列表并打开某一项
- **THEN** 展示其配置内容与来源，界面注明该类型不支持同步

#### Scenario: 尝试触发同步

- **WHEN** 界面渲染非同步类型资源
- **THEN** 不出现同步按钮或勾选入口

### Requirement: 状态标记

系统 SHALL 在列表中区分 invalid、drift、stale、失效链接与建议分类等状态，且同一技能可同时显示多个标记。

#### Scenario: 同时存在多种状态

- **WHEN** 某技能 frontmatter 损坏且为符号链接失效
- **THEN** 卡片同时显示 invalid 与失效链接标记

### Requirement: 大数据量浏览

系统 SHALL 在 500 条以上技能时保持列表滚动与筛选可用，不因全量渲染导致卡顿。

#### Scenario: 500 条技能

- **WHEN** 索引包含 500 条以上技能
- **THEN** 列表滚动流畅，输入筛选关键词后结果在可感知的短时间内更新
