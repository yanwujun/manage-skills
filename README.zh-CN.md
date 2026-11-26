# manage-skills

> 跨 Agent 的本地技能资产管理 CLI：盘点、分类、去重、冲突检测与 hub 同步。
> Audit, organize and sync your agent skills — across Claude Code, Cursor, Codex and Hermes.

[English README](./README.md)

你的技能目录已经乱成一锅粥：`~/.claude/skills`、`~/.cursor/skills`、`~/.codex/skills`
里堆着几百个来历不一的 `SKILL.md`——互相重复、版本漂移、没有分类，却没有任何工具
能告诉你到底拥有什么。

**manage-skills** 是一个本地优先、默认只读的 CLI，治理你**已经拥有的**技能存量
（不是又一个安装器）：

- 🔍 **盘点扫描**——自动探测所有 agent 实例全量清点，WSL + Windows/macOS/Linux 跨 OS 支持
- 🏷️ **分类管理**——通过 sidecar 索引打标分类；除非显式开启，绝不改动你的源文件
- 🩺 **审计检测**——同名不同内容（drift）、同内容不同名（dup）、坏 frontmatter、导致技能静默加载失败的重名冲突
- 🕘 **版本历史**——每次内容变化都记录全文快照；`history` 时间线、显式 `version bump` 带变更说明、`version-drift` 审计
- 🧪 **效果评测**——固定用例回放前后两个版本，规则或 rubric 判定，给出「优化有效 / 变差 / 无显著差异」及成本对比
- 📊 **diff 报告**——与权威库（本地目录或 git 仓库）做 hub-and-spoke 对比，输出 markdown + JSON，可进 CI

## 版本历史

```bash
npx manage-skills scan                       # 检测到变化时自动记录新版本
npx manage-skills history show pdf-toolkit   # 查看单个技能的时间线
npx manage-skills version bump pdf-toolkit --kind patch --note "调整触发词"
```

历史与快照都保存在 `~/.manage-skills`；`scan` 与 `history` 不修改任何技能源文件。
详见 [docs/history.md](./docs/history.md)。

## 效果评测

```bash
npx manage-skills eval compare pdf-toolkit              # 最近两版，每版每条用例 3 次
npx manage-skills eval compare pdf-toolkit --runs 1 --yes
```

用例放在 `<技能目录>/evals/cases.json`；通过率差值 ≥10 个百分点判「优化有效 / 变差」。
详见 [docs/eval.md](./docs/eval.md)。

## 隐私承诺

100% 纯本地、零遥测。工具自身不发起网络请求（hub 为远程 git 仓库时仅走你本机的
git 凭据）；`msk eval` 会显式拉起你本机的 agent CLI，由该 CLI 访问模型。报告默认
脱敏——不打印技能正文，除非显式传 `--full`。

## 项目状态

🚧 **核心引擎已实现；桌面端与 CLI 进行中。**

- 引擎（`src/packages/core`）：盘点扫描、分类、审计、hub diff——106 个测试，行覆盖率约 97%
- 桌面端（Tauri + React）：见 OpenSpec 变更 [desktop-app](./openspec/changes/desktop-app/proposal.md)
- CLI：里程碑 2——见 [bootstrap-mvp-cli](./openspec/changes/bootstrap-mvp-cli/proposal.md) 组 8

npm 包名 `manage-skills` 已预留（0.0.1 占位已发布）；CLI 发布后 `npx manage-skills` 即可使用。

## License

MIT © 2026 yanwujun
