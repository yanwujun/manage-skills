# skill-audit Specification

## Purpose
在不裁决、不自动修改的前提下，检出存量技能中的漂移、重复、无效与命名冲突，让用户拿到可逐条处理的报告。

## Requirements

### Requirement: drift 检测

系统 SHALL 检出同名但内容不同的技能（跨 agent 或跨实例），并在报告中给出 mtime、大小与内容 diff 摘要。

#### Scenario: 跨 agent 同名漂移

- **WHEN** 两个 agent 实例下存在同名 SKILL.md 且内容 hash 不同
- **THEN** 报告列出一条 drift，包含两侧 mtime、大小与 unified diff 前若干行

#### Scenario: 同名同内容不算漂移

- **WHEN** 同名技能内容 hash 相同
- **THEN** 不产生 drift 条目

### Requirement: dup 检测

系统 SHALL 检出不同名但内容完全相同的技能，并给出合并建议。

#### Scenario: 不同名同内容

- **WHEN** 两个技能名称与路径不同但内容 hash 相同
- **THEN** 报告列出一条 dup，标注可合并对象

### Requirement: invalid 检测

系统 SHALL 检出 frontmatter 缺失、YAML 损坏，以及 description 超出目标 agent 限制的技能。

#### Scenario: Hermes description 超长

- **WHEN** Hermes 技能 description 超过 60 字符上限
- **THEN** 报告列出一条 invalid，指出超限字段与所属 agent

#### Scenario: 解析失败归类

- **WHEN** 技能 frontmatter 无法解析
- **THEN** 报告列出一条 invalid，并指出文件路径与失败原因

### Requirement: name-path-conflict 检测

系统 SHALL 检出同一 agent 内重名重路径的技能，并解释其加载影响。

#### Scenario: 同 agent 重名冲突

- **WHEN** 同一 agent 目录下存在两份同名技能导致加载冲突
- **THEN** 报告列出一条 name-path-conflict，并提示其中一份可能无法加载

### Requirement: 只报告不裁决

系统 SHALL 只输出检测结果与建议动作，MUST NOT 自动删除、合并或修改任何技能。

#### Scenario: 审计不修改文件

- **WHEN** 用户执行 `audit`
- **THEN** 所有技能文件内容与 mtime 保持不变

#### Scenario: 为 sync 预留引导

- **WHEN** 审计发现 drift 或 dup
- **THEN** 报告末尾输出「检测到 N 处可同步项」的引导信息，为后续 sync 能力预留入口

### Requirement: 报告脱敏

系统 SHALL 默认在审计报告中不输出技能正文，只输出元数据、hash 与 diff 统计。

#### Scenario: 默认报告

- **WHEN** 用户执行 `audit` 且未要求完整内容
- **THEN** 报告不含技能正文内容

#### Scenario: 含密钥的技能

- **WHEN** 技能文件内含疑似凭据
- **THEN** 默认报告不会将其正文暴露到终端或文件输出中
