# Design

## Context

仓库目前只有 README 与 LICENSE，没有任何代码，属于绿地项目；需求规格已迁入本 change（见 `proposal.md` 与 `specs/`）。开发环境以 Windows 为主力（`D:\个人项目\manage-skills`，Node 24 / npm 11），WSL 侧 `~/projects/manage-skills` 为辅助工作区，两边经 git 同步。需求动机见 `proposal.md — Why`。

约束来自需求本身：

- 纯本地、零遥测、零自建网络请求。
- MVP 只读，唯一写入点是 `~/.manage-skills/` 与显式 `--write-frontmatter`。
- 目标环境包含中文路径、WSL `/mnt/c` 桥接与 500 量级文件。

## Goals / Non-Goals

**Goals:**

- 一套可单测的核心引擎（解析 / hash / 检测 / diff），与 CLI 外壳和真实文件系统解耦。
- 适配器以纯数据 + 纯函数表达，新增 agent 不改引擎。
- 输出统一走报告模型，md 与 json 只是两种渲染器。
- 首次 `scan` 与后续增量 `scan` 共用同一套索引读写路径。

**Non-Goals:**

- 不做并发扫描优化、watcher 或增量监听（500 文件的顺序扫描已满足 <30s 验收线）。
- 不做插件式 adapter 动态加载（MVP 内置四家，留编译期注册表接口）。
- 不做跨 spoke 的两两对比（拓扑只允许 hub ↔ spoke）。

## Decisions

### D1 运行时与模块形态：TypeScript + Node ≥20，ESM

`package.json` 设 `"type": "module"`，`engines.node >= 20`。ESM 是本机与主流 agent 环境的默认形态，避免双产物矩阵。备选 CJS 双产物（兼容更老 Node）被否：验收环境 Node ≥20，双产物只增加构建与调试成本。

### D2 CLI 框架：commander

四个子命令（scan / classify / audit / diff）+ 少量选项，commander 的声明式子命令与 `--help` 足够，依赖轻。备选 yargs 功能更全（中间件、复杂校验），但本项目参数形态简单，收益不抵认知成本。**本决策随里程碑 2 生效**：`src/packages/core` 不依赖 commander，桌面端也不使用它。

### D3 构建与测试：tsup + tsx + vitest + publint

- `tsup` 输出 `dist/` 单入口 bundle 与类型声明，`bin` 指向 `dist/cli.js`（带 shebang）。
- `tsx` 用于本地直接跑 TS 源码调试。
- `vitest` 做单测：核心引擎纯函数化后可直接喂 fixture，不需要 mock 文件系统。
- `publint` + `attw` 作为发布前卡口，防 `exports`/`types` 配置错误。

**时序**：vitest 与 core 构建在组 1 即建立；`bin`、tsup 的 CLI 打包配置与 `publint`/`attw` 卡口随里程碑 2（组 8）落地。

### D4 目录结构：workspaces（core 引擎与 CLI 应用分离）

```text
src/
  packages/core/        # 纯 TS 引擎，不依赖 Node / Tauri API
    adapters/           # 每家 agent 的目录与格式元数据 + 注册表
    core/               # parser / hasher / scanner / classifier / auditor / differ
    storage/            # sidecar 索引与 config 的读写
    report/             # 统一报告模型 + md/json 渲染器
    types/              # 共享类型
    utils/              # 纯 TS 工具（路径、编码、sha256、文本 diff）
  apps/cli/             # 里程碑 2：命令注册与参数解析（commander）
  apps/desktop/         # 桌面端（Tauri + React，见 desktop-app change）
tests/fixtures/         # 虚构的 4 agent 布局样本
docs/                   # adapters / classify / audit / diff 文档（里程碑 2）
tmp/                    # 本地临时工作文件（git 忽略，仅保留 .gitkeep）
```

分层依赖方向：`cli → core/report/storage`，`core → adapters(只读元数据)`，`storage` 不依赖 `core`。引擎接收 `SkillRecord[]` / `AgentInstance[]` 纯数据结构，不直接读盘——扫描入口负责把文件系统事实变成数据结构。

### D5 适配器形态：纯数据 + 探测函数

每个 adapter 导出 `{ id, displayName, globalRoots(), projectRoots(cwd), parseHints }`。跨 OS 与 WSL 桥接在 adapter 内用 `os.homedir()` / `process.platform` / 环境变量判定，输出统一的 `AgentInstance[]`。备选"adapter 类 + 生命周期钩子"被否：MVP 没有状态，函数足够且更好测。

### D6 sidecar 存储：单 JSON + 原子写 + schema 版本

`index.json` 结构：`{ schemaVersion, generatedAt, skills: [{ id, agent, instance, path, hash, mtime, size, frontmatter, category, categorySource, tags, stale }] }`；`config.json` 独立文件，用户可手改。写入采用「临时文件 + rename」原子替换，防止中断产生半截索引。`schemaVersion` 用于后续迁移；版本不认识时拒绝覆盖并提示。

### D7 内容指纹：sha256

用 Node 内置 `crypto` 对文件字节做 sha256。备选 md5 更快，但省下的时间在 500 文件量级可忽略，而 sha256 在跨机器比对与未来 hub 同步中更稳。

### D8 统一报告模型

`audit` 与 `diff` 共用 `Finding` 抽象：`{ kind, skillNames, instances, severity, evidence, suggestion }`。md 渲染为表格化报告，json 直接序列化 `Finding[]` 与元信息。默认脱敏在模型层实现——`evidence` 默认只含元数据与统计，`--full` 才附加正文片段。

### D9 隐私与写保护

- 所有写盘集中在 `storage/` 与 `write-frontmatter` 一个函数，其余模块无 `fs.write*` 调用（测试守护）。
- 报告默认不含正文；终端输出与文件输出共用同一脱敏模型。
- hub 为远程 git 时通过子进程调用用户本机 `git`，不自建 HTTP 客户端，不读取除技能文件外的仓库内容。

### D10 路径处理

统一 `node:path` + `os.homedir()`；入库的路径一律存绝对路径，展示与比较前做规范化（Windows 反斜杠 / 大小写不敏感的比较策略只在比较层，不改磁盘值）。不解析 symlink，避免把用户有意软链的目录当成丢失。中文路径与文件名在 fixture 中覆盖。

### D11 分类建议策略

建议值 = 目录名与技能名/描述的关键词匹配表（内置一小份映射），命中即给 `suggested`。不引入 LLM 或远程分类——MVP 的定位是治理存量，不是智能推断。

## Risks / Trade-offs

- **WSL `/mnt/c` 路径 I/O 慢** → 只探测已知 agent 路径，不做全盘递归；扫描结果进索引，后续命令读索引而非每次重扫。
- **真实技能 frontmatter 千奇百怪**（多行 description、非法缩进、BOM）→ 用成熟 YAML 库的容错解析，解析失败降级为 `invalid` 而非抛出；fixture 覆盖 BOM、多行、坏 YAML、中文。
- **误写源文件**（最大的信任风险）→ 写操作收敛到单一函数 + dry-run 默认 + `.bak` 备份；单测断言"非写命令执行后 mtime 不变"。
- **Hermes 的 category 目录层级**与其它 agent 扁平结构不同 → 在 adapter 内归一化，引擎只见 `frontmatter.category`。
- **JSON 报告的稳定性**是外部契约 → 字段一经发布只增不改；结构变更走 `schemaVersion`。
- **Windows 与 WSL 双工作区同步**可能导致版本漂移 → 以 git 为准，不做本地互相同步。

## Migration Plan

项目尚无用户与既有数据，无需迁移。发布节奏：先 `npm publish 0.0.1` 占位（防抢注），MVP 完成升 `0.1.0`。回滚策略：卸载 npm 包并删除 `~/.manage-skills/` 即可，不触碰用户技能目录。

## Open Questions

（无）
