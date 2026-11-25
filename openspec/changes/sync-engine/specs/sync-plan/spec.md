# Spec Delta

## Purpose

把「哪些技能需要与 hub 对齐、朝哪个方向对齐」变成一份可审阅、可确认、可复现的执行计划，让任何写入都在用户明确同意之后才发生。

## ADDED Requirements

### Requirement: 从对比结果生成计划

系统 SHALL 基于 hub 与 spoke 的对比结果生成同步计划，每个条目包含来源、目标、方向（push / pull）、资源类型与动作（create / update / link / skip）。

#### Scenario: hub 有而 spoke 没有

- **WHEN** 某技能存在于 hub、不存在于目标 spoke
- **THEN** 计划中生成一条 push create 条目，目标路径为该 spoke 下的技能目录

#### Scenario: spoke 有而 hub 没有

- **WHEN** 某技能存在于 spoke、不存在于 hub，且用户选择回收
- **THEN** 计划中生成一条 pull create 条目，目标为 hub 中的对应位置

#### Scenario: 两侧内容一致

- **WHEN** 同名技能在 hub 与 spoke 中内容 hash 相同
- **THEN** 计划中不生成条目

### Requirement: 冲突分组与手动选边

系统 SHALL 把同名不同内容（drift）按技能分组，展示两侧元数据与内容 diff 摘要，并等待用户逐条选择 `hub`、`spoke` 或 `skip`。

#### Scenario: 未选边的冲突

- **WHEN** 存在 drift 但用户尚未选择方向
- **THEN** 该条目保持未决状态，不进入可执行计划

#### Scenario: 选边后生成条目

- **WHEN** 用户对某 drift 选择 `hub`
- **THEN** 计划生成一条以 hub 为来源、覆盖对应 spoke 的 update 条目

### Requirement: 预演清单

系统 SHALL 在不写任何文件的前提下输出预演清单，包含将创建、更新、跳过的条目数及每个目标文件的完整路径。

#### Scenario: 执行前预演

- **WHEN** 用户请求查看计划预演
- **THEN** 系统输出计数摘要与逐条目标路径，且磁盘内容不变

#### Scenario: 空计划

- **WHEN** 对比结果没有任何差异
- **THEN** 系统输出「无需同步」并生成空计划，不报错

### Requirement: 计划快照

系统 SHALL 把计划持久化为快照，记录生成时间、每个条目的来源与目标内容 hash，供执行与恢复复用。

#### Scenario: 快照可复现

- **WHEN** 用户基于同一快照多次执行或查看预演
- **THEN** 计划内容保持一致，除非用户主动修改选边

### Requirement: 同步范围约束

系统 SHALL 仅把 SKILL.md 技能与指令文件纳入计划，记忆、MCP、Hooks、子代理类资源 MUST NOT 出现在任何计划条目中。

#### Scenario: 非同步类型资源

- **WHEN** 用户对某个 MCP 配置或 Hook 请求生成同步计划
- **THEN** 系统明确报告该资源类型不支持同步，不生成条目

### Requirement: hub 只读保护

系统 SHALL 允许把 `~/.agents/skills` 识别为 hub 候选并读取，MUST NOT 生成任何向该目录或其他外部库写入的计划条目。

#### Scenario: 共享库作为 hub

- **WHEN** 用户把 `~/.agents/skills` 指定为 hub 且存在需回收的 spoke 技能
- **THEN** 计划中不包含写入该目录的条目，并提示该目录为只读 hub

#### Scenario: 写入目标校验

- **WHEN** 生成任何计划条目
- **THEN** 目标路径不得等于只读 hub 目录或其子路径
