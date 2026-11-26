# Proposal

## Why

`bootstrap-mvp-cli` 的报告在终端里可读，但面对 158+ 份技能、跨 4 个 agent 的存量治理，浏览、筛选、逐条对比同名技能这些操作在命令行里体验很差；magpie 证明了图形界面的价值，但它是网关客户端、以「写进各 agent」为中心，用户看不到每个文件为什么被改、改了什么。需要一个以**治理**为中心的桌面工作台：先把全部资产看清楚，再决定动哪个。

## What Changes

- 新建 Tauri 2 + React 桌面应用，布局参考 clash-verge（左侧导航、主区卡片列表、状态点、底部操作区）。
- 提供六类资源的只读总览：技能、指令、记忆、MCP、Hooks、子代理；技能与指令可进入同步流程，其余四类只展示。
- 技能目录视图：来源 agent/实例、有效性状态（invalid / drift / stale / 失效链接）、落地方式（copy / symlink）、搜索与筛选。
- 同名对比视图：并排展示两侧元数据与内容 diff，支持逐条选边（hub / spoke / skip），选择入队。
- 同步工作区：展示队列与预演清单，确认后调用 `sync-engine` 执行，展示结果与恢复入口。
- 应用外壳：Windows 桌面窗口、按需启动（不常驻）、关闭即退出；无代码签名，经 GitHub Releases 分发。
- 路径访问：经系统文件选择器授权自定义扫描根；自动探测 `\\wsl$\<distro>\...` 作为 WSL 实例。
- 视觉策略：第一版使用中性色板的功能骨架，设计稿到位后替换设计 token，不改交互逻辑。
- 非目标：不做托盘常驻、不做开机自启、不做自动同步、不做代码签名。

## Capabilities

### New Capabilities

- `desktop-shell`: 应用外壳与生命周期——窗口、启动扫描、路径授权、WSL 实例探测、与 core 引擎的 IO 边界。
- `resource-catalog`: 六类资源的只读浏览——总览计数、卡片列表、搜索筛选、状态与落地方式标记。
- `conflict-resolution`: 同名技能对比与选边——并排 diff、元数据对照、逐条选边入队。
- `sync-workspace`: 同步队列与执行——预演、确认、执行结果、失败原因与恢复入口。

### Modified Capabilities

（无。）

## Impact

- 新增 `src/apps/desktop`：Tauri 2（Rust 壳）+ React + TypeScript 前端，复用 `src/packages/core` 的纯 TS 引擎。
- 新增构建依赖：Rust 工具链（rustup）与 MSVC Build Tools（Windows 打包必需，本机当前未安装）；前端沿用 Vite。
- 新增 Tauri 命令层：文件读取、路径选择、symlink 探测、执行同步——全部薄封装，业务逻辑仍在 core。
- 与 `sync-engine` 的契约：计划与结果 JSON 结构由 core 定义，桌面端只渲染与提交选边。
- 分发：GitHub Releases 提供安装包；未签名，README 与发布页说明 SmartScreen 绕过步骤。
- 隐私：仍为纯本地、零遥测；界面不展示技能正文以外的敏感内容，报告沿用默认脱敏。
