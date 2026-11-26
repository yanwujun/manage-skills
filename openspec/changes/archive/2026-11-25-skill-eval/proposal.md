# Proposal

## Why

优化 skill 之后，作者只能凭感觉判断「是不是变好了」：没有固定用例、没有基线版本、没有可重复的判定口径。技能改动越频繁，越需要一次能回答「优化有效还是变差」的对比，而不是靠印象。

## What Changes

- 新增评测用例约定：技能目录下 `evals/cases.json`，用例包含 `id`、`prompt`、`expect`（`contains` / `notContains` / `regex` / `rubric`）与可选 `timeoutMs`；用例可随技能一起分发，`sync` 只复制 SKILL.md 故不会推送到各 agent。
- 新增 `msk eval compare <技能> [--from <快照|版本>] [--to <快照|版本>] [--runs 3]`：默认比较最近两个内容不同的快照。
- 评测执行：把指定版本的快照写入临时目录的 `.claude/skills/<name>/SKILL.md`，在该临时目录拉起本机已安装的 agent CLI（默认 `claude -p --output-format json`），命令模板可配置；单条用例超时默认 120s，超时或报错计为未通过。
- 判定：规则优先（`contains` / `notContains` / `regex`），规则表达不了时才用 `rubric` 交模型裁判；A/B 顺序随机，并对调顺序各跑一遍以抵消位置偏差。
- 统计：每版本每用例默认 3 次（`--runs` 可调）；通过率差值 ≥10 个百分点判「优化有效 / 变差」，<10 判「无显著差异」；同时汇总平均 cost 与 token。
- 结果落库：`~/.manage-skills/evals/results/<技能>/<runId>.json`，记录两次运行的快照 hash、用例文件 hash、逐用例明细与汇总结论；用例 hash 不一致时报告标注「用例已变，分数不可比」。
- 与版本历史打通：`msk history show <技能>` 在对应版本旁展示关联的评测结论。
- 隐私：manage-skills 自身不发起网络请求；`msk eval` 显式拉起本机 agent CLI，由该 CLI 发请求。运行前打印「用例数 × 次数 × 2 版本」的调用量并要求确认。

## Capabilities

### New Capabilities

- `skill-eval`: 技能评测用例约定、快照回放执行、规则与 rubric 判定、A/B 统计口径，以及评测结果与版本历史的关联。

### Modified Capabilities

（无。`skill-version-history` 由本批前一个 change 新建，本 change 只消费其快照与历史，不改其需求。）

## Impact

- 新增 `src/packages/core/src/core/eval.ts`（执行编排、判定与统计）、`eval-cases.ts`（用例加载与规则判定）、`eval-runner-config.ts`（执行器配置校验）。
- 新增 `src/packages/core/src/storage/eval-store.ts`（结果落盘与读取）。
- 新增 `src/apps/cli/src/io/runner.ts`（解析可执行文件、`execFile` 执行、超时与输出解析）与 `src/apps/cli/src/io/workspace.ts`（临时工作区）；进程与临时目录依赖留在 CLI 层，core 通过 `EvalRuntime` 接口注入，避免桌面端打包引入 Node 内置模块。
- 新增 CLI 命令 `src/apps/cli/src/commands/eval.ts`，接入 `cli.ts`；`history` 命令展示评测结论。
- 依赖本机 `claude` CLI（可配置替代命令）；Windows 下需正确处理 `.cmd` shim。
- 成本：一次对比默认 3 次 × 2 版本 × 用例数次 CLI 调用，运行前须确认。
- README 与隐私说明同步修订：明确「工具自身零网络；eval 显式拉起本机 agent CLI」。
- 发布前的完整评测需用例集同时覆盖「应触发」与「不应触发」两类场景，避免技能对用例集过拟合。
