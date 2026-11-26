# 审计检测

审计基于最近一次 `scan` 生成的索引，只读检测，不修改任何技能文件。

## 五类检测

| 类别 | 含义 | 判定方式 |
| --- | --- | --- |
| `drift` | 同名但内容不同 | 技能名相同、内容 hash 不同（跨 agent / 跨实例） |
| `dup` | 不同名但内容相同 | 内容 hash 相同、名称不同 |
| `invalid` | 无法解析或超出限制 | frontmatter 缺失、YAML 损坏、Hermes description > 60 字符 |
| `name-path-conflict` | 同 agent 内重名重路径 | 同一 agent 下相对路径与名称都相同，可能有一份无法加载 |
| `version-drift` | 内容变了但版本没升 | 与版本历史最近一条相比 hash 变化、frontmatter version 未变 |

## 执行审计

```bash
# 先确保索引是最新的
npx manage-skills scan

# 文本报告（默认脱敏）
npx manage-skills audit

# JSON 报告（供脚本消费）
npx manage-skills audit --json

# 附带差异内容（会输出技能片段，谨慎使用）
npx manage-skills audit --full
```

## 脱敏规则

- 默认只输出元数据：hash、大小、mtime、路径、差异统计（+增 -删 ~改）
- `--full` 才附带差异行，且只针对 drift 条目
- 报告末尾给出「检测到 N 处可同步项」的引导文案

## 典型处理

| 类别 | 建议动作 |
| --- | --- |
| drift | 并排对比后保留一份；或用分类区分用途 |
| dup | 保留一份权威版本，其余标记为重复 |
| invalid | 补 frontmatter 或修复 YAML；Hermes 缩短 description |
| name-path-conflict | 重命名其中一份，或确认哪份应被加载 |
| version-drift | 确认改动后执行 `manage-skills version bump <技能> --note "<原因>"`；或手工补 version |

> `version-drift` 依赖版本历史（`~/.manage-skills/history.jsonl`）。从未扫描过的技能没有基线，不会产生该类条目。
