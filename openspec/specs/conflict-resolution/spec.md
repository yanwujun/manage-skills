# conflict-resolution Specification

## Purpose
让用户在界面上直观看到同名技能的差异，并逐条决定保留哪一边，把「谁是对的」这个判断交还给用户。

## Requirements

### Requirement: 同名技能分组

系统 SHALL 把同名但来自不同实例的技能聚合为一个冲突组，并列出组内每个实例与内容状态。

#### Scenario: 两个实例同名

- **WHEN** hub 与某个 spoke 中存在同名且内容不同的技能
- **THEN** 该技能出现在冲突列表中，组内显示两个来源及各自 hash

#### Scenario: 三个以上实例同名

- **WHEN** 同一技能在三个及以上的实例中存在
- **THEN** 组内列出全部来源，支持逐个实例选择保留或丢弃

### Requirement: 并排差异对比

系统 SHALL 在冲突详情中并排展示两侧元数据（mtime、大小、hash、来源、落地方式）与内容 diff 摘要，默认不展示完整正文。

#### Scenario: 打开冲突详情

- **WHEN** 用户点击某个冲突组
- **THEN** 界面并排显示两侧元数据与差异行摘要

#### Scenario: 查看完整内容

- **WHEN** 用户显式展开完整内容
- **THEN** 界面显示两侧完整正文，且不影响已做的选边

### Requirement: 逐条选边

系统 SHALL 允许用户对每个冲突选择 `hub`、`spoke` 或 `skip`，未选择的冲突不得进入待执行队列。

#### Scenario: 选择 hub

- **WHEN** 用户为某冲突选择 hub
- **THEN** 该冲突标记为「以 hub 为准」，并进入待执行队列

#### Scenario: 选择 skip

- **WHEN** 用户为某冲突选择 skip
- **THEN** 该冲突标记为跳过，不生成任何计划条目

### Requirement: 选边可撤销

系统 SHALL 允许用户在应用之前撤销或修改任意一条选边，界面实时反映队列变化。

#### Scenario: 撤销选择

- **WHEN** 用户把某条选边从 hub 改为未选
- **THEN** 该条目从待执行队列移除

### Requirement: 选择不立即写盘

系统 SHALL 保证选边操作只更新内存中的队列与计划，MUST NOT 在任何文件被修改前写盘。

#### Scenario: 选边后检查文件

- **WHEN** 用户完成若干选边但未执行同步
- **THEN** 所有技能文件内容与 mtime 保持不变

### Requirement: 与计划的映射

系统 SHALL 把选边结果转换为 `sync-engine` 可识别的计划条目，界面展示的队列与计划快照一致。

#### Scenario: 进入同步工作区

- **WHEN** 用户带着已选边冲突进入同步工作区
- **THEN** 队列条目与计划快照中的条目数量、方向、目标路径一致
