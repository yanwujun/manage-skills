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
- 📊 **diff 报告**——与权威库（本地目录或 git 仓库）做 hub-and-spoke 对比，输出 markdown + JSON，可进 CI

## 隐私承诺

100% 纯本地、零遥测、零网络请求（hub 为远程 git 仓库时仅走你本机的 git 凭据）。
报告默认脱敏——不打印技能正文，除非显式传 `--full`。

## 项目状态

🚧 **核心引擎已实现；桌面端与 CLI 进行中。**

- 引擎（`src/packages/core`）：盘点扫描、分类、审计、hub diff——106 个测试，行覆盖率约 97%
- 桌面端（Tauri + React）：见 OpenSpec 变更 [desktop-app](./openspec/changes/desktop-app/proposal.md)
- CLI：里程碑 2——见 [bootstrap-mvp-cli](./openspec/changes/bootstrap-mvp-cli/proposal.md) 组 8

npm 包名 `manage-skills` 已预留（0.0.1 占位已发布）；CLI 发布后 `npx manage-skills` 即可使用。

## License

MIT © 2026 yanwujun
