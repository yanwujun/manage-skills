# Proposal

## Why

技能被反复修改，但索引只保存当前 hash：改了哪几版、每版内容是什么、为什么改，全部无从追溯。审计只能发现「同名不同内容」的横向漂移，看不到同一文件的时间演进；后续「优化前后效果对比」也拿不到旧版全文。

## What Changes

- 新增版本历史存储：中央库 `~/.manage-skills/history.jsonl` 记录事实条目，全文快照按内容寻址存 `~/.manage-skills/blobs/<sha256>.md`，天然去重。
- `scan` 检测到某路径内容 hash 变化时**自动追加**历史条目（只写中央库，不改任何源文件）；条目记录快照 id、hash、version、mtime、size、`cause`（`scan` / `sync` / `bump`）与可选 `note`。
- 新增 `msk history`：按文件路径存事实、按技能 `name` 提供聚合视图，聚合视图标注来源路径与分支，不合并真相。
- 新增 `msk history show <技能>`：展示某技能的时间线、每版差异统计与关联评测结论（评测结论由后续 `skill-eval` 能力写入）。
- 新增 `msk version bump <技能> --kind patch|minor|major [--note "..."]`：预览 → 确认 → 写 `.bak` → 原子替换，只改写 frontmatter 的 `version`，沿用分类回写的既有模式。
- 审计新增 `version-drift` 类别：内容已变化但 frontmatter `version` 未变；`scan` 摘要显式提示该类数量。
- 提供快照回收：无历史/评测引用的 blob 可回收，`msk history purge <技能>` 清理指定技能历史。

## Capabilities

### New Capabilities

- `skill-version-history`: 技能内容变更的历史记录、全文快照、版本升号命令、时间线与聚合查询，以及快照的保留与清理。

### Modified Capabilities

- `skill-audit`: 检测类别从四类扩展为五类，新增 `version-drift`（内容变化但版本号未变）。

## Impact

- 新增 `src/packages/core/src/core/history.ts`、`src/packages/core/src/storage/history-store.ts`、`src/packages/core/src/storage/blob-store.ts`。
- `src/packages/core/src/core/scan.ts` 增加变更检测钩子（保持扫描本身只读）。
- `src/packages/core/src/core/audit.ts` 与报告类型新增 `version-drift`。
- `src/packages/core/src/core/write-frontmatter.ts` 扩展为可改写 `version` 字段（复用预览/备份/原子写）。
- 新增 CLI 命令 `src/apps/cli/src/commands/history.ts`、`version.ts`，接入 `cli.ts`。
- 索引结构不变；历史为独立存储，旧索引可直接使用。
- 隐私：历史与快照与现有索引同处 `~/.manage-skills`，沿用本地文件权限，报告默认脱敏。
