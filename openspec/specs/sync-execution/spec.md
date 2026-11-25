# sync-execution Specification

## Purpose
把已确认的同步计划安全地落到磁盘：写前复核、整体备份、逐条结果、失败可恢复，保证任何一次同步都可回退。

## Requirements

### Requirement: 应用前一致性复核

系统 SHALL 在执行每条计划条目之前重新计算来源与目标文件的内容 hash，与计划快照不一致时跳过该条目并在结果中报告原因。

#### Scenario: 文件在计划后被改动

- **WHEN** 计划生成后、执行前，某个目标文件被外部修改
- **THEN** 该条目被跳过，结果标注「hash 不一致」，其他条目继续执行

#### Scenario: hash 一致

- **WHEN** 执行时来源与目标文件 hash 均与快照一致
- **THEN** 条目按计划执行，并记录执行结果

### Requirement: 执行前整体备份

系统 SHALL 在写入任何目标文件之前，把将被修改或覆盖的现有文件复制到 `~/.manage-skills/backups/<timestamp>/`，并保留其相对路径结构。

#### Scenario: 覆盖前备份

- **WHEN** 某条目将覆盖已存在的技能文件
- **THEN** 原文件已存在于本次备份目录中，备份路径与该文件在 hub 或 spoke 中的相对路径一致

#### Scenario: 新建文件无需备份

- **WHEN** 某条目将在空位置创建文件
- **THEN** 备份目录中不为其生成空占位文件

### Requirement: 单文件原子写入

系统 SHALL 以「写临时文件再重命名」的方式落盘，避免中途中断留下半截文件。

#### Scenario: 写入中断

- **WHEN** 写入过程中进程被终止
- **THEN** 目标路径上的旧文件保持不变，临时文件不影响后续读取

### Requirement: 执行结果报告

系统 SHALL 输出本次执行的 created / updated / skipped / failed 计数与逐条明细，失败条目附原因。

#### Scenario: 部分失败

- **WHEN** 计划中部分条目因 hash 不一致或权限问题失败
- **THEN** 报告区分成功与失败条目，并给出失败的完整路径与原因

### Requirement: 备份恢复

系统 SHALL 支持按备份时间戳恢复：可将整份备份还原到原位置，也可恢复单条技能。

#### Scenario: 全量恢复

- **WHEN** 用户对某次备份执行全量恢复
- **THEN** 备份中记录的文件被写回原路径，恢复前的状态另行备份

#### Scenario: 单条恢复

- **WHEN** 用户只指定某个技能恢复
- **THEN** 仅该技能被还原，其余文件不变

### Requirement: 不自动删除

系统 SHALL 在常规同步中只创建与更新文件，MUST NOT 删除任何目标侧的技能；删除只允许通过显式 `prune` 指名，且删除前先移入备份。

#### Scenario: hub 缺少某技能

- **WHEN** 某技能只在 spoke 存在，用户未显式 prune
- **THEN** 该技能保持原样，不被同步流程删除

#### Scenario: 显式删除

- **WHEN** 用户执行 `prune <skill>` 且确认
- **THEN** 该技能先进入备份目录，随后从目标位置移除

### Requirement: 崩溃可恢复

系统 SHALL 保证执行中途崩溃时，已完成条目保持完成状态、未完成条目不受影响，且备份可用于恢复。

#### Scenario: 执行中崩溃

- **WHEN** 执行到第 N 条时进程异常退出
- **THEN** 前 N-1 条的结果已落盘，本次备份完整，用户可据报告与备份恢复
