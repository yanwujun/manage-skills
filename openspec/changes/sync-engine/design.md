# Design

## Context

本 change 建立在 `bootstrap-mvp-cli` 的索引（`~/.manage-skills/index.json`）与 `diff` 对比结果之上，把只读报告变成可执行计划。写入面第一次扩展到用户技能目录，因此设计重心不是功能，而是**可预览、可复核、可回退**。桌面端（`desktop-app`）不另行实现同步逻辑，而是消费同一份计划模型与执行结果。

## Goals / Non-Goals

**Goals:**

- 计划与执行两阶段分离：计划阶段零写盘，执行阶段只接受已确认的快照。
- 计划模型成为跨端契约：CLI 与 Tauri 命令按同一 JSON 结构生产与消费。
- 任何一次执行都留下完整备份与 manifest，可整份或单条恢复。
- 写入路径唯一：所有落盘经 executor，禁止其它模块直接写用户技能文件。

**Non-Goals:**

- 不做后台自动同步、文件监听或定时任务（治理工具按需运行）。
- 不做 git 提交自动化（v2 再议）。
- 不做远程分发安装。
- 不做冲突的自动裁决（选边永远由用户决定）。

## Decisions

### D1 两阶段：plan → snapshot → apply

`sync plan` 只读对比结果并产出计划快照；`sync apply <snapshot>` 执行快照。备选「一条命令边算边写」被否：无法预演，也无法在执行前复核用户可能改动过的选边。快照持久化在 `~/.manage-skills/plans/<id>.json`。

### D2 计划模型作为跨端契约

计划条目字段固定为：`{ id, skillName, sourcePath, sourceHash, targetPath, targetHash?, direction, action, resourceType, linkMode, selectedSide?, status }`。core 负责生成与校验；Tauri 端只渲染与提交选边，不自行拼装条目。备选「两端各自定义结构」被否：桌面端与 CLI 的行为会漂移。

### D3 备份：时间戳目录 + manifest

备份落 `~/.manage-skills/backups/<timestamp>/`，目录内保持文件相对路径，另写 `manifest.json` 记录每条的原绝对路径、原 hash、备份内相对路径与操作类型。恢复完全依赖 manifest，不靠猜目录结构。恢复前先对当前状态做一次二次备份，避免「恢复本身造成丢失」。

### D4 单文件原子写：同目录临时文件 + rename

临时文件必须写在目标文件所在目录（跨文件系统 rename 不原子）。写入顺序：创建父目录 → 写 `.tmp-<id>` → `rename` 覆盖。失败时清理临时文件，目标保持原状。

### D5 执行前复核：hash 不一致即跳过

每个条目执行前重算来源与目标的当前 hash，与快照比对；任一不一致则该条目标 `skipped` 并记录原因，其余继续。备选「不一致也照写」被否：用户可能在预览后手工改过文件，覆盖会丢掉这份改动。

### D6 链接能力检测

创建 symlink 前做能力探测：在目标目录写一个临时链接并删除，失败则判定无权限并给出提示（Windows 开发者模式/管理员）。跨文件系统判定用 `stat` 的 `dev` 字段比较。不静默降级为复制——用户选择的形态必须真实生效或明确失败。

### D7 写入门禁与只读 hub

executor 是唯一写入口，入口处校验：目标路径不得位于只读 hub（如 `~/.agents/skills`）、不得是符号链接指向的外部位置、必须位于已探测的 agent 实例目录内。计划生成阶段对任何资源类型都只读。

### D8 幂等与并发

同一快照重复执行时，hash 一致的已存在目标视为已完成（不重复写）；执行期间对 `~/.manage-skills/` 加文件锁，防止两个进程同时写同一目标。

### D9 恢复语义

`restore <timestamp>` 全量恢复；`restore <timestamp> --skill <name>` 单条恢复。恢复同样走原子写与二次备份，结果计入 report。

## Risks / Trade-offs

- **WSL 挂载不可达导致「目标为空」** → 执行前复核会把「目标文件消失」判为 hash 不一致并跳过，绝不按空目录写入；扫描层同时标记实例不可达。
- **符号链接在 Windows 权限受限** → 探测失败即报错，用户可切换为 copy；不静默降级。
- **中途崩溃留下部分完成** → 按条目落盘 + manifest 记录，崩溃后报告已完成项，备份可恢复。
- **备份目录膨胀** → 默认保留最近 N 次（可配置），清理只删备份目录内的文件，不触碰源目录。
- **用户在计划后改动文件** → 复核机制牺牲「一次成功」，换取「不丢改动」，是有意的取舍。
- **两份实现（Node/Tauri）语义漂移** → 计划与结果都是纯 JSON，核心校验逻辑放在 core，两端只做 IO。

## Migration Plan

无既有用户。`bootstrap-mvp-cli` 的索引格式不变，本 change 只新增 `plans/` 与 `backups/` 目录；旧索引可直接复用。回滚策略：停止使用同步命令即可，备份目录可整份删除。

## Open Questions

（无）
