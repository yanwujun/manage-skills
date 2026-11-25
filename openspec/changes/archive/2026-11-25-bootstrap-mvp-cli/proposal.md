# Proposal

## Why

用户本机的 `~/.claude/skills`、`~/.cursor/skills`、`~/.codex/skills`、`~/.hermes/skills` 等目录已堆积数百份来历不一、互相重复、缺乏分类的技能文件，而现有工具（vercel-labs `npx skills`、npm `skill-manager`）全部聚焦「从远程分发安装到本地」，没人治理本地存量。用户需要一次看清：我有哪些技能、哪些重名/重复、哪些格式坏了、哪些该并到权威库。

## What Changes

- 新建 TypeScript / Node ≥20 CLI 包 `manage-skills`（bin 名 `manage-skills`，短别名 `msk`），npm 分发，MIT。
- 新增 `scan` 命令：遍历全部已探测 agent 实例，容错解析 SKILL.md frontmatter，落盘 sidecar 索引并输出终端摘要表。
- 新增 `classify` 命令：按「frontmatter 已有分类 > sidecar 手工标注 > 关键词建议值」定分类；`classify set` 只写 sidecar，可选 `--write-frontmatter` 在显式确认、`.bak` 备份与 dry-run 预览后回写源文件。
- 新增 `audit` 命令：检出 `drift`（同名不同内容）、`dup`（不同名同内容）、`invalid`（frontmatter 缺失/坏 YAML/description 超限）、`name-path-conflict`（同 agent 内重名重路径），只报告不自动裁决。
- 新增 `diff [--hub <path|repo>]` 命令：spoke ↔ hub 逐技能对比（only-in-hub / only-in-spoke / drift），输出 `md` 或 `json`，默认脱敏。
- 新增 adapter 层：Claude Code / Cursor / Codex / Hermes 四家目录约定与格式差异，其余 agent 预留接口。
- 新增跨 OS 探测：Windows / macOS / Linux 本机路径，WSL 场景自动桥接 `/mnt/c/Users/<user>/...` 并标记为独立实例。
- 新增 sidecar 存储：`~/.manage-skills/index.json`（清单/hash/mtime/category/标注）与 `config.json`（扫描根、hub、排除规则）。
- 明确非目标（留 v2）：sync 执行、git 备份自动化、MCP server 形态、更多 adapter。
- 信任边界：MVP 全程只读，唯一写入路径是显式 `--write-frontmatter`。

## Capabilities

### New Capabilities

- `agent-discovery`: agent 实例探测与适配器元数据——各 agent 全局/项目级目录表、跨 OS 与 WSL 桥接、用户配置覆盖与排除规则。
- `skill-inventory`: 技能扫描与索引——frontmatter 容错解析、内存模型、sidecar 索引持久化、增量刷新与 stale 标记。
- `skill-classification`: 分类管理——分类来源优先级、`classify set` 写 sidecar、可选 frontmatter 回写（备份 + dry-run）。
- `skill-audit`: 存量审计——drift / dup / invalid / name-path-conflict 四类检测与可读报告，为 v2 sync 预留执行计划接口。
- `hub-diff-report`: spoke ↔ hub 只读对比——hub 布局识别、三类差异分类、md/json 双格式输出、默认脱敏。

### Modified Capabilities

（无，本 change 为项目首个 change。）

## Impact

- 新增代码：整个 CLI 包（命令层、adapter 层、解析/hash/diff 引擎、sidecar 存储层），含 fixtures 与单测；核心引擎单测覆盖 ≥80%。
- 新增依赖：CLI 框架与构建工具（候选 commander/yargs + tsup/tsx，在 design 阶段定稿）。
- 分发与仓库：npm 包 `manage-skills`（先 publish 0.0.1 占位）、GitHub `yanwujun/manage-skills`、README 英中双语。
- 运行时影响：只读用户技能目录；写入仅限 `~/.manage-skills/` 与显式 `--write-frontmatter`（带备份）。
- 验收基线：作者本机 WSL + Windows 双 OS、4 agent、约 500 份技能文件，一次全量 `scan` < 30s 且无崩溃。
