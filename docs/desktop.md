# manage-skills 桌面端指南

## 功能概览

- **资源目录**：集中查看 Claude Code / Cursor / Codex / Hermes（含 WSL 实例）下的技能，支持关键词搜索、来源/状态/标签组合筛选与虚拟滚动；指令、记忆、MCP、Hooks、子代理提供只读查看视图。
- **同名冲突**：自动按技能名分组，支持三实例及以上并排对比元数据与摘要、逐条选边（选边不写盘）。
- **相似组审查**：后台 Web Worker 计算相似度，按分数排序，展示描述/正文分项得分与链式提示，支持查看详情、加入同步队列、标记不是重复与阈值调整。
- **同步工作区**：队列展示 → 预演确认 → 逐条备份与原子写入 → 结果页与一键复制恢复命令。

## 权限范围

- 默认仅读取已授权的 Agent 技能目录及 `~/.manage-skills/` 索引与备份目录。
- 未授权路径的读取请求会被 Tauri 后端白名单拒绝；可通过界面「添加扫描根…」显式授权额外目录。
- 所有写操作仅在用户于同步工作区点击「确认并执行」后触发，且写前自动备份到 `~/.manage-skills/backups/<timestamp>/`。

## 主题变量

布局尺寸、中性色板与状态色定义在 `src/apps/desktop/src/theme.css` 的 CSS 变量中，后续视觉稿替换可直接修改变量而不触及组件逻辑。

## GitHub Releases 发布说明与 Windows SmartScreen 绕过步骤

Windows 安装包（NSIS `.exe`）当前未购买商业 EV 代码签名证书，首次运行时 Windows Defender SmartScreen 可能弹出「Windows 已保护你的电脑」提示。

1. 从 GitHub Releases 下载对应版本的 `manage-skills_<version>_x64-setup.exe`。
2. 双击运行安装程序，若出现 SmartScreen 拦截弹窗，点击 **「更多信息」**（More info）。
3. 核对发布者与下载来源为本项目官方 Releases 后，点击 **「仍要运行」**（Run anyway）完成安装。
4. 安装完成后启动应用，索引与备份默认读写 `~/.manage-skills/`。
