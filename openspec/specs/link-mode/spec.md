# link-mode Specification

## Purpose
定义技能落到各 agent 目录的方式：默认复制保证零权限失败，符号链接作为知情选择供高级用户使用，并让落地方式在报告与界面中始终可见。

## Requirements

### Requirement: 两种落地模式

系统 SHALL 支持 `copy`（复制）与 `symlink`（符号链接）两种落地方式，默认使用 `copy`，并允许按 Agent 覆盖。

#### Scenario: 默认复制

- **WHEN** 用户未指定落地方式执行同步
- **THEN** 目标目录中写入技能文件的独立副本，修改源文件不影响已复制的副本

#### Scenario: 按 Agent 覆盖

- **WHEN** 用户为 Cursor 指定 symlink、其余 Agent 保持默认
- **THEN** Cursor 目录下创建符号链接，其他 Agent 目录仍为复制

### Requirement: 符号链接权限检测

系统 SHALL 在创建符号链接前检测当前环境能力；不满足条件时明确拒绝并提示原因，MUST NOT 静默降级为复制。

#### Scenario: Windows 未开启开发者模式

- **WHEN** Windows 环境下用户选择 symlink 且当前账户无创建符号链接权限
- **THEN** 系统拒绝执行并提示开启开发者模式或以管理员运行，计划中该条目标记失败

#### Scenario: 跨文件系统目标

- **WHEN** hub 与目标 spoke 位于不同文件系统（如 WSL 侧与 Windows 挂载路径）
- **THEN** 系统检测并提示符号链接可能不可用或不生效

### Requirement: 落地方式可见

系统 SHALL 在索引、报告与界面中记录并展示每个技能的落地方式（copy / symlink），不得让两种形态在用户无感知的情况下混存。

#### Scenario: 列表区分形态

- **WHEN** 用户查看某 Agent 目录下的技能清单
- **THEN** symlink 与 copy 状态的技能可被区分显示

#### Scenario: 变更前提示

- **WHEN** 用户把某技能的落地方式从 copy 切换为 symlink
- **THEN** 系统先提示该操作会替换现有文件，并在确认后执行

### Requirement: 模式切换一致性

系统 SHALL 在切换落地方式时先备份旧文件，切换后目标位置只保留一种形态，不产生同一技能的双份内容。

#### Scenario: copy 转 symlink

- **WHEN** 用户将某技能从 copy 切换为 symlink
- **THEN** 原副本移入备份，位置被符号链接替换，目录中不同时存在副本与链接

#### Scenario: symlink 转 copy

- **WHEN** 用户将某技能从 symlink 切换为 copy
- **THEN** 链接被移除并写入独立副本，索引记录更新为 copy

### Requirement: 链接失效可检测

系统 SHALL 能识别指向不存在目标的符号链接，并在扫描与报告中标注为失效链接。

#### Scenario: 源文件被删除

- **WHEN** symlink 技能的源文件已不存在
- **THEN** 扫描结果将该条目标记为失效链接，报告给出修复建议

#### Scenario: 源文件恢复

- **WHEN** 失效链接的源文件重新出现且内容匹配索引记录
- **THEN** 该技能恢复为正常状态
