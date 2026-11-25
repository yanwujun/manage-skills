# Proposal

## Why

`bootstrap-mvp-cli` 的只读 `diff` 能告诉用户哪些技能漂移、哪些只在 hub、哪些只在 spoke，但用户拿到报告后仍要手工 `cp` 或改文件；magpie 虽然有同步能力，却要求把全部资产迁进它自己的 Library 模型，写入过程对用户不透明。需要在现有索引与对比之上补一层**可预览、可回退、可控**的同步执行：先出计划，再确认，再写盘，写坏能恢复。

## What Changes

- 新增同步计划能力：`sync plan` 基于 `diff`/`audit` 结果生成执行计划，包含方向（push / pull）、资源类型、冲突分组、用户选边与预演清单。
- 新增计划执行能力：`sync apply` 按计划写盘，默认复制，可选符号链接；支持按 Agent 覆盖链接方式。
- 同名冲突（drift）处理：输出并排对比（元数据 + 内容 diff 摘要），用户逐条选边；选择先入队，最后统一应用，不在浏览过程中立即写盘。
- 写前保护：应用前对整个计划做一致性复核（hash 与计划生成时一致才写），并整体备份到 `~/.manage-skills/backups/<timestamp>/`，提供恢复命令。
- 删除语义：不做自动传播删除；仅显式 `prune` 指定技能时移入备份后删除。
- 同步范围：仅 SKILL.md 技能与指令文件（Claude `commands/*.md`、Cursor `commands/*.md`）；记忆、MCP、Hooks、子代理不参与同步，仅在桌面端只读展示。
- hub 兼容：`~/.agents/skills` 可作为普通目录被识别为 hub 候选，只读，不作为本工具的写入目标。
- 非目标：远程分发安装、MCP server 形态、桌面界面（由 `desktop-app` change 承担）。

## Capabilities

### New Capabilities

- `sync-plan`: 同步计划的构建——从对比结果产出可审阅的计划，含方向、资源类型、冲突分组、选边记录与预演清单。
- `sync-execution`: 计划执行——写盘、备份、一致性复核、结果报告与恢复。
- `link-mode`: 复制与符号链接两种落地方式、权限检测与按 Agent 覆盖。

### Modified Capabilities

（无。本 change 只新增能力，不改变 `bootstrap-mvp-cli` 已定义的只读行为。）

## Impact

- 新增代码：`src/packages/core` 下新增 planner / executor / backup 模块；`src/apps/cli` 后补 `sync` 命令；桌面端消费同一份计划模型。
- 写入面扩大：从「只写 `~/.manage-skills/`」扩展到「可写 hub 与 spoke 技能目录」——所有写入必须经过计划、备份与复核，任何模块不得直接写用户技能文件。
- 新增存储：`~/.manage-skills/backups/`（按时间戳分目录）与计划快照（用于执行与恢复）。
- 依赖：文件复制/链接使用 Node 内置能力；桌面端通过 Tauri 命令执行同一语义，两个 IO 适配器共享计划格式。
- 风险面：写盘不可逆性、WSL 挂载不可达、符号链接权限——由 specs 中的安全场景与 design 的防护设计承接。
