# Spec Delta

## Purpose

把各 agent 实例（spoke）与用户指定的权威技能库（hub）做只读对比，产出可直接消费的差异报告，为后续同步能力提供执行依据。

## ADDED Requirements

### Requirement: hub 布局自动识别

系统 SHALL 接受本地目录或 git 仓库作为 hub，并自动识别 `<name>/SKILL.md` 与 `skills/<name>/SKILL.md` 两种常见布局。

#### Scenario: 根级布局

- **WHEN** hub 中技能位于 `<name>/SKILL.md`
- **THEN** 系统正确定位每个技能及其名称

#### Scenario: skills 子目录布局

- **WHEN** hub 中技能位于 `skills/<name>/SKILL.md`
- **THEN** 系统同样正确定位，不重复计数

### Requirement: 三项差异分类

系统 SHALL 将 spoke 与 hub 的逐技能对比结果分为 only-in-hub、only-in-spoke 与 drift 三类。

#### Scenario: 仅 hub 存在的技能

- **WHEN** 某技能存在于 hub 而不在任何 spoke
- **THEN** 报告归类为 only-in-hub

#### Scenario: 仅 spoke 存在的技能

- **WHEN** 某技能存在于某个 spoke 而不在 hub
- **THEN** 报告归类为 only-in-spoke，并标注来源实例

#### Scenario: 两侧同名不同内容

- **WHEN** 同名技能在 hub 与 spoke 中内容 hash 不同
- **THEN** 报告归类为 drift，并标注两侧 hash 与 mtime

### Requirement: 双格式输出

系统 SHALL 支持 `--format md|json` 两种输出，JSON 结构稳定、可供脚本与 CI 消费。

#### Scenario: JSON 输出

- **WHEN** 用户执行 `diff --hub <path> --format json`
- **THEN** 输出为合法 JSON，包含三类差异的稳定字段结构

#### Scenario: markdown 输出

- **WHEN** 用户执行 `diff --hub <path> --format md`
- **THEN** 输出可读的 markdown 报告

### Requirement: 默认脱敏

系统 SHALL 默认不在 diff 报告中输出技能正文，仅在用户显式使用 `--full` 时附带内容。

#### Scenario: 默认 diff 报告

- **WHEN** 用户执行 `diff` 未指定 `--full`
- **THEN** 报告只含元数据与 diff 统计，不含技能正文

#### Scenario: 显式完整输出

- **WHEN** 用户执行 `diff --full`
- **THEN** 报告附带技能正文内容

### Requirement: hub 不可用时的处理

系统 SHALL 在 hub 路径不存在或 git 仓库不可访问时给出明确错误，不产出残缺报告。

#### Scenario: hub 路径不存在

- **WHEN** 用户指定的 hub 路径不存在
- **THEN** 系统报错并退出，不生成空的 diff 报告

#### Scenario: 远程 git 仓库使用本机凭据

- **WHEN** hub 为远程 git 仓库
- **THEN** 系统通过用户本机 git 凭据访问，不发起任何自建网络请求或遥测
