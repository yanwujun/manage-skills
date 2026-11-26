# Design

## Context

`skill-version-history` 已提供按内容寻址的版本快照，可按 hash 取回任意历史版本全文；索引与历史均在 `~/.manage-skills` 下。CLI 现有外部进程调用仅用于 git（`src/apps/cli/src/io/git.ts` 的 `execFile`）。项目承诺「工具自身零网络」，评测需要模型参与，因此必须把模型调用外包给用户本机已有的 agent CLI。详见 proposal.md。

## Goals / Non-Goals

**Goals:**

- 一次命令完成「选版本 → 回放执行 → 判定 → 统计 → 落结果 → 关联历史」。
- 判定口径可解释、可复现：同一用例、同一版本、同一命令，重跑结论应稳定。
- 不新增密钥配置，不改变 manage-skills 的零网络边界。

**Non-Goals:**

- 不做绝对能力评分，只做同技能两版本的相对比较。
- 不做并行执行（首版串行，规避外部 CLI 并发与配额问题）。
- 不做桌面端评测视图。
- 不自动生成用例，用例由作者编写。

## Decisions

### D0 分层：core 只保留纯逻辑，进程与临时目录在 CLI 层

`eval.ts` 通过 `EvalRuntime` 接口（`createWorkspace` / `run` / `judge` / `dispose`）调用运行时，CLI 注入基于 `node:child_process` 与 `node:fs` 的实现。理由：core 被桌面端（webview）复用，在 core 内静态引入 Node 内置模块会破坏前端打包；纯接口同时让编排逻辑可用假运行时单测。

### D1 运行器：解析可执行文件后 `execFile`，禁用 shell

配置项写入 `~/.manage-skills/config.json` 的 `evalRunner`：`{ "command": "claude", "args": ["-p", "--output-format", "json"] }`，缺省即该值。

Windows 下 `claude` 实际是 `claude.cmd`，`execFile` 不会解析 shim。做法：启动前按 `PATH` + `PATHEXT` 解析出真实可执行路径（`.cmd` / `.exe`），再直接 `execFile`，**不使用 `shell: true`**——避免用例 prompt 中的引号、`&` 等字符被 shell 解释。解析失败时报错指出命令名与配置位置。

### D2 临时工作区：每版本独立目录

```text
<tmp>/manage-skills-eval/<runId>/<a|b>/.claude/skills/<name>/SKILL.md
```

从历史快照写入 SKILL.md，以该目录为 `cwd` 启动外部 CLI。默认运行结束删除；`--keep` 保留并输出路径便于排查。真实技能目录全程只读。

### D3 输出解析：宽松读取 JSON 结果

优先解析 `--output-format json` 的 JSON（取 `result`、`usage`、`total_cost_usd`、`is_error`）；解析失败时把 stdout 全文当作文本结果、cost 记为未知，**不因此判失败**，避免因外部 CLI 输出版本差异误杀整轮评测。超时由 Node 侧定时器 kill 进程，直接记未通过。

### D4 判定：规则前置，rubric 兜底

- 规则：`contains` 全部出现、`notContains` 全部不出现、`regex` 匹配，三者按用例提供的项组合，全部满足即通过，不调用模型。
- rubric：仅当用例没有规则字段时，追加一次裁判调用，裁判 prompt 包含用例 rubric、原始 prompt 与被测输出，要求返回 `{ "pass": boolean, "reason": string }`。
- 裁判与执行使用同一 runner 配置，保证 A/B 同裁判。

### D5 顺序控制：按轮次交替，不额外增加调用

每个用例每轮先跑 A 后跑 B 或反之，按轮次索引交替（奇数轮 A→B，偶数轮 B→A）。`--runs 3` 时两种顺序都出现且调用量仍为 `用例 × 3 × 2`，不因「对调」翻倍。`--runs 1` 无法覆盖双向，报告标「低置信」。

### D6 版本解析：技能名必须解析到唯一路径

`msk eval compare <技能>` 按 frontmatter `name` 匹配历史：唯一路径则直接使用；多处路径（drift）时报错并列出路径，要求 `--path` 指定。`--from`/`--to` 接受 versions 字符串或无歧义 hash 前缀，默认取最近两个不同 hash 的条目。

用例文件从解析出的技能当前目录读取 `evals/cases.json`（不从快照读），一次运行只读一次并记录其内容 hash；这样「用例已变」的判定才有基准。

### D7 统计与结论

逐用例保留每次判定；版本通过率 = 通过次数 / 总次数。差值 = 新版本 − 旧版本，绝对值 ≥10 个百分点判有效/变差，否则无显著差异。汇总平均 cost、输入/输出 token；`--runs < 2` 标「低置信」。结论只声明「对该用例集」有效。

### D8 结果与历史的关联方式

结果文件 `~/.manage-skills/evals/results/<技能>/<runId>.json` 记录 `fromHash`、`toHash`、`casesHash`、逐用例明细与汇总结论。`history show` 读取该目录，按 `toHash`（及 `fromHash`）匹配历史条目并在版本行尾展示最近一次结论，不做反向写入历史文件，避免两处状态互相污染。

### D9 成本确认

运行前计算并展示 `用例数 × runs × 2`（rubric 用例另计裁判调用，单独提示），未传 `--yes` 时等待确认。首版不设硬性费用上限——用例集由作者控制，硬上限容易在有效用例上误拦。

## Risks / Trade-offs

- [模型抖动导致结论不稳] → 默认 3 轮 + 双向顺序 + 同裁判；`--runs 1` 明确标低置信。
- [用例过拟合：技能只对用例集变好] → 文档要求用例同时覆盖「应触发」与「不应触发」；结论固定表述为「对该用例集」。
- [外部 CLI 输出格式变化] → 宽松解析 D3；只依赖 `result` 文本，cost/usage 缺失时降级展示。
- [Windows 命令解析失败] → 启动前解析并报错给出配置位置，而不是抛原始 ENOENT。
- [用户全局存在同名 skill 干扰] → 项目级 `.claude/skills` 优先；文档提示如结果异常可用 `--keep` 检查工作区。
- [评测成本随用例数线性增长] → 运行前确认 + `--runs` 可调；首版串行执行也限制了瞬时配额压力。
- [快照缺失或损坏] → 读取快照失败时中止并指出缺失 hash，不静默用当前文件顶替。

## Migration Plan

- 新增命令与存储目录，无数据结构迁移；现有 `index.json` 与历史可直接使用。
- `config.json` 新增可选 `evalRunner`，缺省值生效，旧配置无需改动。
- 首次使用需已积累至少两个版本（依赖 `skill-version-history` 已落地）。
- README 与隐私说明同轮修订：工具自身零网络，评测时拉起本机 agent CLI。
