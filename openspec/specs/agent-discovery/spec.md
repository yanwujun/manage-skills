# agent-discovery Specification

## Purpose
发现本机所有 agent 实例及其技能目录，为上层的扫描、分类、审计与 diff 提供统一的"技能从哪来"的事实来源。

## Requirements

### Requirement: 内置目录发现

系统 SHALL 根据内置目录表探测 Claude Code、Cursor、Codex、Hermes 四类 agent 的全局与项目级技能目录，并将每个存在的目录视为一个独立 agent 实例。

#### Scenario: 探测到多个 agent 实例

- **WHEN** 本机同时存在 `~/.claude/skills`、`~/.cursor/skills`、`~/.codex/skills` 与 `~/.hermes/skills`
- **THEN** 四个目录各自作为独立实例纳入扫描范围，并携带所属 agent 标识

#### Scenario: agent 目录不存在

- **WHEN** 某 agent 的目录在本机不存在
- **THEN** 系统跳过该实例，不报错、不中断其他实例的扫描

#### Scenario: Cursor rules 不计入技能

- **WHEN** Cursor 项目级存在 `.cursor/rules/*.mdc`
- **THEN** 系统识别其存在，但不将其计入技能数量与技能报告

### Requirement: 跨操作系统路径解析

系统 SHALL 在 Windows、macOS、Linux 本机解析各 agent 的用户主目录路径，并在 WSL 环境自动桥接 Windows 侧目录。

#### Scenario: WSL 桥接 Windows 侧实例

- **WHEN** 系统运行于 WSL 且探测到 `/mnt/c/Users/<user>/.claude` 等 Windows 侧目录
- **THEN** 该目录作为独立实例纳入扫描，并标记 `os: windows-wsl-bridge`

#### Scenario: 本机原生路径

- **WHEN** 系统运行于 Windows、macOS 或 Linux 本机
- **THEN** 使用当前用户主目录解析各 agent 路径

### Requirement: 用户配置覆盖

系统 SHALL 允许用户通过 `~/.manage-skills/config.json` 增加或移除扫描根、配置排除规则，且用户配置优先于内置目录表。

#### Scenario: 用户新增扫描根

- **WHEN** config.json 声明了一个额外的技能目录
- **THEN** 该目录参与扫描，并在报告中标注来源为「用户配置」

#### Scenario: 配置的路径不存在

- **WHEN** config.json 声明的某个扫描根不存在
- **THEN** 系统输出警告并继续扫描其余目录，不中断

### Requirement: 适配器与引擎解耦

系统 SHALL 将各 agent 的目录约定与格式差异收敛在适配器元数据中，扫描引擎不得硬编码任一 agent 的路径。

#### Scenario: agent 目录约定变更

- **WHEN** 某 agent 修改了技能目录约定
- **THEN** 仅需更新该 agent 的适配器元数据，扫描与审计引擎无需改动

#### Scenario: 未支持的 agent

- **WHEN** 用户请求扫描目前未支持的 agent
- **THEN** 系统明确报告该 agent 未支持，并提示可通过配置覆盖接入
