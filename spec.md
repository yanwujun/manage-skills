# manage-skills — 需求规格 v0.1

> 跨 Agent 的本地技能资产管理 CLI：盘点、分类、去重、冲突检测与 hub 同步。
> Audit, organize and sync your agent skills across Claude Code / Cursor / Codex / Hermes.

状态：需求已定稿（2026-11-24 盘问收敛），待脚手架开工。

## 1. 定位与差异化

**一句话**：管理用户本地**已有存量**技能资产（inventory & governance），不做远程安装分发。

**博弈定位**（为什么这样切）：
- vercel-labs `npx skills` / skills.sh、npm `skill-manager`(skm)：全部主打"从远程装到本地/项目"（分发赛道），已饱和。
- npm `skillkeeper`（observability/rollback 方向）：0 star、5 commits、2026-07 后停更，已死。
- **空白区**：用户的 `~/.claude/skills`、`~/.cursor/skills` 等目录躺着几百个来历不一、互相重复、无分类的存量文件，没有工具治理。本项目占这个位。
- 名字不挤 "manager" 心智（npm skill-manager 活跃在位），动词式 `manage-skills` + audit 定位 slogan 区隔。

**信任原则**：MVP 纯只读，默认不写任何用户技能文件；报告即产品。

## 2. 支持的 Agent（adapter 层）

MVP 四个适配器 + 预留接口（Copilot / Windsurf / Gemini CLI / OpenCode 后续加）。

| Agent | 全局技能目录 | 项目级目录 | 格式 |
|---|---|---|---|
| Claude Code | `~/.claude/skills/<name>/SKILL.md`、`~/.claude/commands/*.md` | `.claude/skills/` | SKILL.md + YAML frontmatter；commands 为裸 md + `$ARGUMENTS` |
| Cursor | `~/.cursor/skills/<name>/SKILL.md` | `.cursor/skills/`、`.cursor/rules/*.mdc` | SKILL.md（rules 的 .mdc 单独识别，不混入技能统计） |
| Codex | `~/.codex/skills/<name>/SKILL.md` | `.agents/skills/` | SKILL.md |
| Hermes | `~/.hermes/skills/[<category>/]<name>/SKILL.md`（含 `~/.hermes/profiles/<p>/skills/`） | — | SKILL.md + frontmatter `category:` 原生生效 |

**跨 OS 探测**（核心差异点之一）：
- Windows/macOS/Linux 本机路径 day 1 支持。
- WSL 场景：自动探测 `/mnt/c/Users/<user>/.claude|.cursor` 等 Windows 侧目录，视为独立"agent 实例"（标记 `os: windows-wsl-bridge`）。
- 发现逻辑 = 内置已知路径表 + `~/.manage-skills/config.json` 用户覆盖（add/remove 扫描根）。
- 路径表与核心解耦：agent 改目录约定时只动 adapter 元数据，不动引擎（对抗格式漂移）。

## 3. MVP 功能（v0.x，全只读）

### F1 盘点扫描 `manage-skills scan`
- 遍历全部已探测 agent 实例，解析 SKILL.md frontmatter（name/description/category/tags/version）。
- 容错解析：frontmatter 缺失/坏 YAML 不崩溃，标记 `invalid` 单独列出。
- 输出：内存模型 → 落盘 sidecar 索引（见 §5）+ 终端摘要表。

### F2 分类管理 `manage-skills classify`
- 为每个技能打 category：已有 frontmatter category > sidecar 手工标注 > 基于目录/关键词的建议值（标 `suggested`，不自动生效）。
- `manage-skills classify set <skill> --category <cat>`：写入 sidecar（不动源文件）。
- `--write-frontmatter`（可选、显式）：把 sidecar 分类写回 SKILL.md frontmatter。默认关闭，写前自动 `.bak` 备份 + dry-run 预览。

### F3 重复/冲突检测 `manage-skills audit`
- **drift**：同名不同内容（跨 agent / 跨实例），报告 mtime、大小、内容 diff 摘要（前 N 行 unified diff）。
- **dup**：不同名同内容（内容 hash 相同），报告可合并建议。
- **invalid**：frontmatter 缺失/坏 YAML/description 超各 agent 限制（如 Hermes ≤60 字符）。
- **name-path-conflict**：同一 agent 内重名重路径（Hermes 实际故障案例：两份同名技能导致其一无法加载）。
- 只报告不自动裁决；每条附 `mtime` + hash + 建议动作，为 v2 sync 留 hook（报告末尾输出"检测到 N 处 drift，v2 将支持 sync fix"式引导）。

### F4 只读 diff 报告 `manage-skills diff [--hub <path|repo>]`
- spoke（各 agent 实例）↔ hub（用户指定的权威库，见 §6）逐技能对比：only-in-hub / only-in-spoke / drift。
- 输出 markdown + JSON 双格式（`--format md|json`），CI 可消费。
- 报告脱敏：默认不输出技能正文，只输出元数据与 diff 统计；`--full` 才带内容。

## 4. v2 路线（明确不做进 MVP）

- **sync 执行**：把 F4 报告变成可执行动作（hub→spoke 推送 / spoke→hub 回收，带白名单规则文件）。
- **git 备份**：hub 为 git 仓库时的 commit/push 自动化。
- **MCP server 形态**："让你的 agent 自己整理自己的技能库"（卖点级功能）。
- 更多 adapter：Copilot / Windsurf / Gemini CLI / OpenCode。

## 5. 数据模型与存储

- **sidecar 中央索引**：`~/.manage-skills/index.json`（技能清单、hash、mtime、category、标注）+ `config.json`（扫描根、hub 配置、排除规则）。
- 索引与源文件通过 `路径 + content-hash` 关联；文件变动时 scan 增量刷新，失联条目自动标 stale。
- **默认不写用户技能文件**；唯一写入路径是 F2 的显式 `--write-frontmatter`（带备份 + dry-run）。
- 隐私红线：纯本地、零遥测、零网络请求（hub 为远程 git repo 时除外，走用户本机 git 凭据）；README 首屏声明。技能文件可能含 secret，任何报告默认脱敏。

## 6. 同步拓扑：hub-and-spoke

- 用户指定一个权威库为 hub：本地目录或 git 仓库（推荐 git，免费获得版本历史/回滚/多机同步）。
- 各 agent 实例为 spoke；同步永远是 hub↔spoke，不做 spoke↔spoke pairwise（组合爆炸 + 三方裁决噩梦）。
- hub 内布局不强制，自动识别 `<name>/SKILL.md` 与 `skills/<name>/SKILL.md` 两种常见结构。
- MVP 只出 spoke↔hub diff 报告；v2 sync 直接复用该报告作为执行计划。

## 7. 技术栈与工程约定

- **TypeScript / Node ≥20**，npm 分发：`npx manage-skills`（bin 名 `manage-skills`，短别名 `msk`）。
- CLI 框架、构建工具选型留给 plan 阶段（候选：commander/yargs + tsup/tsx）。
- 平台：Windows / macOS / Linux day 1（WSL `/mnt/c` 桥接为一等公民场景）。
- 仓库：`yanwujun/manage-skills`（GitHub，MIT）；npm 包 `manage-skills`（已实查 404 可用，**待 `npm login` 后发布 0.0.1 占位**）。
- 文档：README.md（英）+ README.zh-CN.md（中）；issue 模板提醒勿贴公司路径/敏感技能内容。
- 质量门槛：核心引擎（解析/hash/diff）单测覆盖 ≥80%；每个 adapter 带 fixture 目录测试（模仿用户 4 agent 真实布局的虚构样本，**严禁使用真实个人/公司技能做 example**）。

## 8. 验收标准（MVP）

1. 在"WSL + Windows 双 OS、4 agent、约 500 份技能文件"的真实环境（作者本机）一次 `scan` 全量盘点 <30s，无崩溃。
2. `audit` 能复现已知真实案例：Hermes 下 `change-ripple-analysis` 重名冲突被检出并给出可读报告。
3. `classify set` + sidecar 索引重启后数据不丢；`--write-frontmatter` dry-run 与实际写入一致，`.bak` 可回滚。
4. `diff --format json` 输出结构稳定，可被脚本消费；默认输出不含技能正文。
5. 全新机器 `npx manage-skills scan` 零配置跑通（无任何 agent 时优雅报告"未发现"而非报错）。

## 9. 风险登记（红队结论）

| 风险 | 对手/来源 | 对策 |
|---|---|---|
| 只读工具低频使用，用户"哇一声就走" | 用户注意力 | 报告末尾留 sync hook；v2 尽快把 diff 变执行 |
| vercel-labs/skills 跟进加 audit 子命令 | 在位巨头 | 深耕多 agent×跨 OS×hub-spoke；其基因是分发 |
| npm 名被抢注 | squatter | npm login 后立即 publish 0.0.1 占位 |
| agent 格式/路径漂移 | Claude Code、Cursor 未来版本 | adapter 元数据与引擎解耦 + 版本探测 |
| 用户怀疑工具偷传技能/密钥 | 信任 | 纯本地零遥测 + README 首屏声明 + 报告默认脱敏 |
| 作者 dogfood 泄露公司上下文 | 自己 | example/fixture 全虚构；issue 模板脱敏提醒 |

## 10. 决策记录

| 决策点 | 结论 | 来源 |
|---|---|---|
| 定位 | 存量治理为主 + 同步为辅（分期） | 盘问 Q1，用户选 C |
| Agent 范围 | Claude Code/Cursor/Codex/Hermes，其余留接口 | 盘问 Q2 |
| MVP 功能 | 盘点+分类+去重+只读 diff | 盘问 Q3 |
| 形态 | CLI + md/JSON 报告；MCP server 留 v2 | 盘问 Q4 |
| 与旧 tripartite_sync_*.py 关系 | 独立新项目，旧脚本继续跑，跑顺后淘汰 | 盘问 Q5 |
| README | 英中双语 | 盘问 Q6 |
| 技术栈 | TypeScript/Node，npm 分发 | 盘问 Q7 |
| 元数据 | sidecar 为主 + 可选写回 frontmatter | 盘问 Q8 |
| 同步拓扑 | hub-and-spoke | 盘问 Q9 |
| License | MIT | 盘问 Q11 |
| 名字 | npm `manage-skills` + GitHub `yanwujun/manage-skills` | 用户拍板（npm 404 实查可用） |
