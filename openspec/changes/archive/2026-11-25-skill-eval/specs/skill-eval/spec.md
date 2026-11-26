# Spec Delta

## Purpose

用固定用例和可回放的版本快照，对技能优化的前后两个版本做 A/B 评测，输出通过率、成本与明确结论，让作者知道这次优化是有效、变差还是无显著差异。

## ADDED Requirements

### Requirement: 评测用例约定

系统 SHALL 从技能目录下的 `evals/cases.json` 读取用例；每个用例 MUST 包含唯一 `id`、`prompt`，以及 `contains` / `notContains` / `regex` / `rubric` 中至少一项判定条件，可选 `timeoutMs`（默认 120000）。

#### Scenario: 正常加载用例

- **WHEN** 技能目录存在格式合法的 `evals/cases.json`
- **THEN** 系统读取全部用例并在运行前展示用例数量与 id 列表

#### Scenario: 用例文件缺失

- **WHEN** 技能目录没有 `evals/cases.json`
- **THEN** 系统报错指出缺失路径，不执行任何评测

#### Scenario: 用例字段非法

- **WHEN** 某用例缺少 id、prompt 或全部判定条件
- **THEN** 系统报错并指出具体用例 id，不启动运行

### Requirement: 用例版本可比性

每次评测运行 SHALL 记录 `evals/cases.json` 的内容 hash；若与同一技能最近一次评测的用例 hash 不一致，报告 MUST 标注「用例已变，分数不可比」。

#### Scenario: 用例未变化

- **WHEN** 本次用例 hash 与该技能最近一次评测记录的 hash 相同
- **THEN** 报告正常给出对比结论

#### Scenario: 用例被修改

- **WHEN** 本次用例 hash 与该技能最近一次评测记录的 hash 不同
- **THEN** 报告仍展示分数，但顶部标注「用例已变，分数不可比」

### Requirement: 对比版本选择

系统 SHALL 默认比较该技能最近两个内容不同的快照；用户可通过 `--from` 与 `--to` 指定历史版本或快照 hash 前缀。版本不足或引用无法解析时 MUST 报错并列出可用版本。

#### Scenario: 默认比较最近两版

- **WHEN** 用户未指定 from 与 to，且该技能至少有两个不同内容的版本
- **THEN** 系统以最近两版作为对比对象

#### Scenario: 显式指定版本

- **WHEN** 用户通过 `--from` 与 `--to` 指定两个已存在的版本
- **THEN** 系统按指定版本执行对比

#### Scenario: 版本不足

- **WHEN** 该技能只有一个版本或没有任何历史
- **THEN** 系统报错提示先积累至少两个版本，并列出可用版本

### Requirement: 快照回放执行

系统 SHALL 把待测版本快照放入临时目录的 `.claude/skills/<name>/SKILL.md`，在该临时目录中拉起本机配置的 agent CLI 执行用例；默认命令为 `claude -p --output-format json`，命令模板可配置。单条用例超时或进程失败 MUST 计为未通过，不中断整轮评测。

#### Scenario: 用例执行成功

- **WHEN** 外部 CLI 在超时前正常退出
- **THEN** 系统记录其标准输出，并从 JSON 结果中提取 usage 与 cost

#### Scenario: 用例超时

- **WHEN** 某条用例执行超过其 `timeoutMs`
- **THEN** 系统终止该次执行并将其记为未通过，继续后续用例

#### Scenario: 执行命令不可用

- **WHEN** 配置的命令不存在或无法启动
- **THEN** 系统报错指出命令与配置位置，不产生半途结果文件

#### Scenario: 不触碰真实技能目录

- **WHEN** 评测执行期间
- **THEN** 系统只读写临时目录中的快照副本，真实技能目录内容不变

### Requirement: 规则优先的判定

系统 SHALL 先按用例的 `contains` / `notContains` / `regex` 规则判定，全部满足才算通过；仅当用例只提供 `rubric` 时才调用模型裁判给出通过与否及理由。A/B 执行顺序 MUST 按轮次交替（第 1 轮先基线后目标，第 2 轮反之）。

#### Scenario: 规则全部满足

- **WHEN** 输出包含全部 `contains`、不含任何 `notContains` 且匹配 `regex`
- **THEN** 该次执行判为通过，不调用模型裁判

#### Scenario: 规则不满足

- **WHEN** 任一规则条件不满足
- **THEN** 该次执行判为未通过，不调用模型裁判

#### Scenario: 仅 rubric 的用例

- **WHEN** 用例只提供 `rubric`
- **THEN** 系统调用模型裁判，记录通过与否与裁判理由

#### Scenario: 顺序偏差控制

- **WHEN** 同一用例存在多轮执行（`--runs` ≥ 2）
- **THEN** A/B 先后顺序按轮次交替（第 1 轮先基线后目标，第 2 轮先目标后基线），两种顺序都出现

### Requirement: 统计与结论

系统 SHALL 按版本统计逐用例通过率，汇总平均 cost 与 token；两版本通过率差值绝对值 ≥10 个百分点时判为「优化有效」或「变差」，<10 个百分点判为「无显著差异」。`--runs` 小于 2 时报告 MUST 标注「低置信」。

#### Scenario: 通过率显著提升

- **WHEN** 新版本通过率比旧版本高 10 个百分点或以上
- **THEN** 结论为「优化有效」，并给出两个通过率

#### Scenario: 通过率显著下降

- **WHEN** 新版本通过率比旧版本低 10 个百分点或以上
- **THEN** 结论为「变差」，并给出两个通过率

#### Scenario: 差异不显著

- **WHEN** 两版本通过率差值小于 10 个百分点
- **THEN** 结论为「无显著差异」

#### Scenario: 单次运行

- **WHEN** 用户以 `--runs 1` 执行对比
- **THEN** 报告仍给出结论，但标注「低置信」

### Requirement: 结果持久化与历史关联

系统 SHALL 把每次对比写入 `~/.manage-skills/evals/results/<技能>/<runId>.json`，包含两个版本的快照 hash、用例 hash、逐用例明细与汇总结论；`msk history show <技能>` SHALL 在对应版本旁展示关联结论。

#### Scenario: 写入结果文件

- **WHEN** 一次对比完成
- **THEN** 结果文件包含两个快照 hash、用例 hash、逐用例通过情况与汇总结论

#### Scenario: 历史视图展示评测结论

- **WHEN** 用户查看存在评测记录技能的历史
- **THEN** 对应版本条目旁显示最近一次评测结论与通过率

### Requirement: 运行成本确认与隐私边界

系统 SHALL 在运行前展示「用例数 × 次数 × 2 版本」的预计调用次数并要求确认，`--yes` 可跳过确认；manage-skills 自身 MUST NOT 发起任何网络请求，网络请求仅由被拉起的外部 CLI 发出。

#### Scenario: 运行前确认

- **WHEN** 用户启动对比且未传 `--yes`
- **THEN** 系统展示预计调用次数，等待确认后才执行

#### Scenario: 跳过确认

- **WHEN** 用户传入 `--yes`
- **THEN** 系统直接执行

#### Scenario: 工具自身零网络

- **WHEN** 评测运行期间
- **THEN** manage-skills 进程不建立任何外部网络连接
