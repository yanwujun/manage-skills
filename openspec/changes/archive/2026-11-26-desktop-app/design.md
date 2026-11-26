# Design

## Context

桌面应用是 `bootstrap-mvp-cli`（索引与扫描）与 `sync-engine`（计划与执行）之上的展示与操作层。计划与结果 JSON 由 core 定义，桌面端只负责渲染、收集选边与触发命令。本机当前**没有 Rust 工具链与 MSVC Build Tools**，这是第一组任务的前置条件。视觉参考 clash-verge（Tauri + React + MUI 的同类桌面应用）。

## Goals / Non-Goals

**Goals:**

- 一个窗口完成「看清存量 → 对比冲突 → 确认同步」的闭环。
- core 引擎零改动复用：同一份 TS 代码同时服务 CLI 与桌面端。
- 文件系统访问全部经受控命令层，界面层无直接 IO。
- 500+ 技能下列表滚动与筛选保持流畅。

**Non-Goals:**

- MVP 不做 macOS/Linux 打包（Windows 一等公民，后续补产物）。
- 不做托盘、开机自启、后台常驻。
- 不做自动同步或文件监听。
- 不在第一版追求视觉完成度（设计稿后续替换 token）。

## Decisions

### D1 技术栈：Tauri 2 + React + TypeScript + MUI + Vite

与 clash-verge 同栈，布局与组件风格可直接借鉴；MUI 提供卡片、抽屉、表格等治理界面常用组件。状态用 zustand，长列表用 `@tanstack/react-virtual`。备选 Electron 被否：体积与内存开销大，且 Tauri 的 WebView 足够支撑治理类界面。

### D2 core 复用与 IO 边界

`src/packages/core` 为纯 TS（无 `node:*`、无 Tauri API），跑在 WebView 内负责决策：解析、hash 比对、计划生成、状态归类。Rust 侧只暴露薄命令：列目录、读文件、读元信息、写临时文件、rename、创建/读取符号链接、枚举 WSL 发行版、打开目录。所有写语义由前端按 core 的指令逐条调用命令完成。备选「Rust 重写核心引擎」被否：两份实现必然漂移。

### D3 启动策略：索引先行 + 后台刷新

窗口打开后先读 `~/.manage-skills/index.json` 渲染，再后台扫描刷新；刷新中列表与筛选可用，进度以顶部条展示。备选「每次启动全量扫描再显示」被否：500 条文件在 `\\wsl$` 路径上会让首屏等待过久。

### D4 路径授权

内置 agent 目录与 `\\wsl$\*` 在 Tauri capability 中按只读方式授权；用户添加自定义扫描根时经系统文件选择器授权后再写入 `config.json`。命令层对每个路径做白名单校验，越权直接拒绝。

### D5 布局：三栏 + 详情抽屉

左侧导航（技能/指令/记忆/MCP/Hooks/子代理/审计/同步/设置，带计数），中部卡片列表（搜索框 + 筛选条 + 虚拟滚动），右侧详情抽屉（不离开列表即可看 diff）。状态色：drift 橙、invalid 红、stale 灰、symlink 蓝点。全部定义为 CSS 变量，设计稿到位后整体替换。

### D6 冲突对比交互

冲突组内左侧为 hub、右侧为各 spoke；元数据与 diff 摘要同屏，正文默认折叠。选边按钮直接改写队列状态，不触发任何文件写入；队列状态是唯一真相源，同步工作区读取同一份状态。

### D7 同步执行的编排位置

前端从队列生成计划（复用 core），执行时逐条调用 Rust 命令完成「备份 → 临时写 → rename」；每条完成后写 manifest。备选「一次性把整个计划交给 Rust 批量执行」被否：中断时无法精确报告进度，且 Rust 侧要复制一份计划校验逻辑。

### D8 发布

`tauri build` 产出 NSIS 安装包，上传 GitHub Releases；不做代码签名，发布页与 README 写明 SmartScreen 绕过步骤。自动更新不在 MVP。

## Risks / Trade-offs

- **Rust/VS 工具链缺失阻塞开工** → 第一组任务就是安装与最小窗口验证，失败即停并上报。
- **WebView 内 hash 大文件耗时** → 500 份技能单文件通常很小，hash 在 TS 侧用流式读取；若实测慢，再下放至 Rust 命令。
- **`\\wsl$` 读取慢或发行版未启动** → 懒加载实例内容，超时标记不可达，不阻塞其他实例。
- **Tauri 权限过宽** → capability 按目录最小授权，命令层二次校验。
- **双端执行语义漂移（CLI / 桌面）** → 计划与结果共用一个 JSON schema，契约测试在两端共享。
- **无签名分发被 SmartScreen 拦截** → 风险登记；有下载量后再考虑证书。

## Migration Plan

无既有用户数据。桌面端与 CLI 共用 `~/.manage-skills/`，切换使用不会造成索引不一致。回滚：卸载桌面应用即可，索引与备份保留。

## Open Questions

（无）
