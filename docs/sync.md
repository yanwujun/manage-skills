# 同步（计划 → 执行 → 恢复）

同步把 hub（权威库）与各 agent 实例的技能对齐。所有写操作都遵循同一条路径：**先生成计划、再确认、再执行、失败可恢复**。计划阶段不写任何技能文件。

## 流程

```bash
# 1. 先刷新索引
npx manage-skills scan

# 2. 生成计划（冲突需选边）
npx manage-skills sync plan --hub ~/skills-hub --select pdf-toolkit=hub

# 3. 查看预演输出，确认后执行
npx manage-skills sync apply --plan plan-mwvtc4ed

# 4. 需要时从备份恢复
npx manage-skills sync restore --backup ~/.manage-skills/backups/2026-11-25_15-39-55
```

## sync plan

```bash
# 默认 push：以 hub 为准更新各 agent；hub 独有技能需要 --target 才会生成条目
npx manage-skills sync plan --hub ~/skills-hub --target cursor

# 回收：把 agent 里独有的技能收进 hub
npx manage-skills sync plan --hub ~/skills-hub --direction pull

# 冲突选边（可多次），未选边的冲突只进入计划、不会执行
npx manage-skills sync plan --hub ~/skills-hub --select alpha=hub --select beta=skip

# JSON 输出（含 planPath）
npx manage-skills sync plan --hub ~/skills-hub --json
```

输出示例：

```text
计划 plan-mwvtc4ed 已保存：/home/me/.manage-skills/plans/plan-mwvtc4ed.json
创建 0 · 更新 1 · 冲突 0 · 跳过 0
PUSH update alpha -> /home/me/.claude/skills/alpha/SKILL.md（copy）
```

## sync apply

```bash
npx manage-skills sync apply --plan plan-mwvtc4ed
# 或直接指定快照路径
npx manage-skills sync apply --plan ~/.manage-skills/plans/plan-mwvtc4ed.json
```

执行前会：

1. 校验来源与目标文件 hash 与计划快照一致，不一致的条目跳过；
2. 把将被覆盖的文件备份到 `~/.manage-skills/backups/<时间戳>/` 并写 `manifest.json`；
3. 逐条写入，单条失败不影响其余条目；
4. 执行期间持有 `.lock`，防止并发写。

结果输出 created / updated / skipped / failed 及失败原因。

## sync restore

```bash
# 全量恢复
npx manage-skills sync restore --backup ~/.manage-skills/backups/2026-11-25_15-39-55

# 只恢复某个技能
npx manage-skills sync restore --backup ~/.manage-skills/backups/2026-11-25_15-39-55 --skill alpha
```

恢复前会把当前状态二次备份到 `<备份目录>/pre-restore/<时间戳>/`，避免「恢复本身造成丢失」。

## 安全边界

| 规则 | 行为 |
| --- | --- |
| 只读 hub | 目标路径位于 hub 之下时拒绝写入；`diff`/`plan` 对 hub 只读 |
| 显式删除 | 常规同步只创建/更新，不删除；删除需 `prune` 且先备份 |
| 不静默降级 | 选择 symlink 但环境不支持时直接报错，不改成 copy |
| 不覆盖计划外改动 | 执行前 hash 复核，目标被外部修改则跳过该条 |
| 并发保护 | `.lock` 文件；异常退出后可手动删除后重试 |

## 范围限制

- 可同步：SKILL.md 技能与指令文件
- 不可同步：MCP、Hooks、记忆、子代理（记忆/MCP/Hooks 的写入会破坏 agent 启动）

## 计划快照格式

快照位于 `~/.manage-skills/plans/<id>.json`，结构由 `src/packages/core/schema/sync-plan.schema.json` 定义，CLI 与桌面端共用同一 schema。字段变更会同时打破两端的契约测试。