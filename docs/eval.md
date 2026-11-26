# 技能评测（A/B）

对比同一技能优化前后的两个版本：用固定用例分别回放两个版本，比较通过率与成本，给出「优化有效 / 变差 / 无显著差异」的结论。

前提：

- 已通过 `scan` 积累至少两个内容不同的版本（见 [history.md](./history.md)）；
- 技能目录下存在 `evals/cases.json`。

## 用例格式

```json
[
  {
    "id": "export-basic",
    "prompt": "把这个表格导出为 PDF",
    "expect": { "contains": ["导出成功"], "notContains": ["错误"] }
  },
  {
    "id": "style-check",
    "prompt": "生成一份周报",
    "expect": { "rubric": "周报包含本周完成、下周计划、风险三部分，语言简洁" },
    "timeoutMs": 90000
  }
]
```

也可以写成 `{ "cases": [...] }` 对象。规则：

- `id` 唯一，`prompt` 非空；
- `expect` 至少包含 `contains` / `notContains` / `regex` / `rubric` 之一；
- 有任意规则字段时按规则判定，不调用模型裁判；只有 `rubric` 时才调用裁判；
- `timeoutMs` 可选，默认 120000。

## 执行

```bash
# 默认：最近两个内容不同的版本，每版每条用例 3 次
npx manage-skills eval compare pdf-toolkit

# 指定版本（版本号或 hash 前缀）
npx manage-skills eval compare pdf-toolkit --from 1.0.0 --to 1.0.1

# 同名技能对应多个路径时指定路径
npx manage-skills eval compare pdf-toolkit --path ~/.claude/skills/pdf-toolkit/SKILL.md

# 降低调用量（报告会标「低置信」）
npx manage-skills eval compare pdf-toolkit --runs 1 --yes
```

执行前会打印「用例数 × 次数 × 2 版本」的调用量并要求确认；`--yes` 跳过确认，非交互环境必须带 `--yes`。

## 执行方式与边界

- 把两个版本分别写入临时目录的 `.claude/skills/<name>/SKILL.md`，在该目录拉起本机 agent CLI（默认 `claude -p --output-format json`），**不触碰真实技能目录**；
- 命令可在 `~/.manage-skills/config.json` 覆盖：

```json
{ "evalRunner": { "command": "claude", "args": ["-p", "--output-format", "json"] } }
```

- Windows 下会自动按 `PATHEXT` 解析 `.cmd` / `.exe`，不使用 shell，避免提示词中的引号被解释；
- 单条用例超时或执行失败计为未通过，不中断整轮；
- `--keep` 保留临时工作区并输出路径，便于排查；
- manage-skills 自身不发起网络请求，网络请求由被拉起的外部 CLI 发出。

## 判定口径

- 每版本每用例默认 3 次，A/B 顺序按轮次交替（第 1 轮先基线后目标，第 2 轮反之）；
- 通过率差值（目标 − 基线）≥10 个百分点判「优化有效」，≤−10 判「变差」，其余「无显著差异」；
- `--runs 1` 无法覆盖双向，报告标注「低置信」；
- 同时汇总平均 cost 与 token，用于判断是否「更贵才更好」。

## 结果与历史关联

结果写入 `~/.manage-skills/evals/results/<技能>/<runId>.json`，包含两个版本的快照 hash、用例 hash、逐用例明细与汇总结论。`manage-skills history show <技能>` 会在对应版本旁展示最近一次评测结论。

若同一技能的用例文件在两次评测之间发生变化，报告会标注「用例已变，分数不可比」。
