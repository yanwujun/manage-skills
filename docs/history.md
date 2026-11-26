# 版本历史

版本历史记录每个技能内容的每一次变化：按文件路径保留事实，按技能名聚合展示，并按内容 hash 保存全文快照。`scan` 与 `history` 全程只写 `~/.manage-skills`，不修改任何技能源文件。

## 存储

```text
~/.manage-skills/
  history.jsonl          # 每行一条历史：路径、hash、版本、来源、时间
  blobs/<sha256>.md      # 技能全文快照，相同内容只存一份
```

历史条目包含：路径、agent/实例、frontmatter name、内容 hash、大小、mtime、version、变更来源（`scan` / `sync` / `bump`）、可选说明与记录时间。正文不写入历史文件，只在快照中保存原始内容。

## 自动记录

`scan` 完成后逐路径对比最后一条历史：

- 内容 hash 变化 → 追加一条 `cause: scan` 记录并保存快照；
- 内容未变 → 不追加；
- 首次收录 → 建立基线条目。

`sync apply` 写入成功的技能会追加 `cause: sync` 记录；`version bump` 写入后追加 `cause: bump` 记录。

## 查询

```bash
# 全部历史（按时间倒序）
npx manage-skills history

# 只看某个技能（按 frontmatter name）
npx manage-skills history --name pdf-toolkit

# 同名跨路径聚合视图：每行标注来源路径，不合并为线性演进
npx manage-skills history show pdf-toolkit

# JSON 输出（供脚本消费）
npx manage-skills history --json
npx manage-skills history show pdf-toolkit --json
```

每行展示时间、版本、hash 短码、大小、相对同一路径上一版的差异统计（`+增 -删 ~改`）。默认不输出技能正文；快照不可读时差异统计显示 `—`。

## 版本升号

`scan` 发现「内容变了但 version 没变」时会在摘要里提示数量，审计也会报 `version-drift`。确认改动合理后：

```bash
# 预览并按 patch 递增（缺 version 时写入 0.1.0）
npx manage-skills version bump pdf-toolkit

# 指定递增位与变更说明
npx manage-skills version bump pdf-toolkit --kind minor --note "新增批量导出"

# 只预览，不写入
npx manage-skills version bump pdf-toolkit --dry-run

# 非交互环境或跳过确认
npx manage-skills version bump pdf-toolkit --yes
```

写入规则：

- 只改 frontmatter 的 `version` 一行，其余内容不动；
- 写入前显示「当前版本 → 新版本」预览；
- 实际写入前校验文件未被改动，写 `SKILL.md.bak` 备份后原子替换；
- 版本号为严格三段式（`1.2.3`）；非三段式报错中止，缺失时初版为 `0.1.0`；
- 同名技能对应多个路径时，必须用完整路径指定。

## 清理

```bash
# 清理该技能的全部历史，并回收不再被任何历史/评测结果引用的快照
npx manage-skills history purge pdf-toolkit

# 跳过确认（脚本环境）
npx manage-skills history purge pdf-toolkit --yes
```

共享快照（仍被其他技能历史或 `~/.manage-skills/evals/results` 引用）不会被删除。
