# Tasks

> 执行顺序：本 change 的验收核心是 `src/packages/core` 引擎能力（组 1-7）；CLI 命令层、文档与 npm 分发属于里程碑 2（组 8），在 `desktop-app` 落地后再执行。桌面端直接消费 core，不依赖 CLI。

## 1. 工作区与 core 脚手架

- [x] 1.1 建立 npm workspaces 根（根 `package.json`、`tsconfig.base.json`、vitest 配置；ESM、Node ≥20）与 `src/packages/core`，验证 `npm install && npm run test` 在空测试集下通过
- [x] 1.2 建立 `src/packages/core` 模块骨架（`adapters/` `core/` `storage/` `report/` `types/` 与统一出口），验证 `npm run build` 产出 ESM 产物与类型声明
- [x] 1.3 增加 lint 规则禁止 `src/packages/core` 引用 `node:fs` 等 Node 专属 API（IO 由调用方注入），验证故意引入时 lint 报错

## 2. 适配器与实例探测

- [x] 2.1 定义 `AgentAdapter` / `AgentInstance` 类型与编译期注册表，验证类型测试能列出四个 adapter id
- [x] 2.2 实现 Claude Code / Cursor / Codex / Hermes 的全局与项目级目录元数据（含 Hermes 的 category 层级与 `profiles/<p>/skills`），验证各 adapter 单测断言目录表与项目级路径
- [x] 2.3 实现跨 OS 与 WSL 桥接探测（`os.homedir()`、`process.platform`、`/mnt/c/Users/*` 探测并标记 `windows-wsl-bridge`），验证单测覆盖四平台分支（用可注入的 platform/home 参数）
- [x] 2.4 实现 `~/.manage-skills/config.json` 的扫描根增删与排除规则，验证单测：用户配置优先、路径不存在时告警不中断
- [x] 2.5 建立 `tests/fixtures/` 四 agent 虚构布局（含中文路径、`.cursor/rules` 干扰项），验证探测测试能按 fixture 根目录产出预期实例列表

## 3. 扫描与 sidecar 索引（F1）

- [x] 3.1 实现 frontmatter 容错解析器（BOM、多行 description、坏 YAML、缺字段），验证单测对每类输入返回正常字段或 `invalid` 且不抛异常
- [x] 3.2 实现 sha256 内容指纹与文件元信息采集，验证单测断言同内容同 hash、不同内容不同 hash
- [x] 3.3 实现 `index.json`/`config.json` 存储层（原子写、`schemaVersion`、未知版本拒绝覆盖），验证单测模拟写入中断后原索引完好
- [x] 3.4 实现扫描引擎（纯数据：实例 + 文件 → 记录集合）与索引落盘，验证在 fixture 布局上单测输出实例数、技能数、invalid 数
- [x] 3.5 实现增量刷新与 `stale` 标记，验证单测：改内容只更新该条、删文件标 `stale` 且保留手工标注
- [x] 3.6 生成 500 份虚构技能的基准脚本并测量一次全量扫描耗时 <30s，验证基准输出耗时且无崩溃
- [x] 3.7 加扫描只读守护测试：扫描执行后所有文件内容与 mtime 不变（审计/diff 的只读守护分别并入 5.6、6.3）

## 4. 分类管理（F2）

- [x] 4.1 实现分类优先级解析（frontmatter > sidecar 标注 > 关键词建议值），验证单测覆盖三级优先级与 `suggested` 标记
- [x] 4.2 实现分类查询 API（含已确认分类与建议值的区分），验证单测返回结构与优先级一致
- [x] 4.3 实现设置分类 API（仅写 sidecar，不触碰源文件），验证测试中断进程重启后标注仍在、源文件 mtime 不变
- [x] 4.4 实现 `--write-frontmatter` 能力：dry-run 预览、`.bak` 备份、确认后回写，验证 dry-run 输出与实际写入一致且可从 `.bak` 回滚

## 5. 存量审计（F3）

- [x] 5.1 实现统一 `Finding` 报告模型与 md 渲染器（默认脱敏，`evidence` 只含元数据），验证单测断言默认输出不含正文
- [x] 5.2 实现 drift 检测（同名不同 hash，附 mtime/大小/unified diff 摘要），验证单测复现同名漂移 fixture
- [x] 5.3 实现 dup 检测（不同名同 hash + 合并建议），验证单测区分「同名同内容」不误报
- [x] 5.4 实现 invalid 检测（缺 frontmatter、坏 YAML、Hermes description >60 字符），验证单测覆盖三类并标注所属 agent
- [x] 5.5 实现 name-path-conflict 检测（同 agent 重名重路径），验证单测用 Hermes 重名 fixture 检出并给出加载影响说明
- [x] 5.6 实现审计报告生成（四类条目 + 「检测到 N 处可同步项」引导文本），验证端到端运行产出四类条目，且审计执行后技能文件内容与 mtime 不变

## 6. hub diff 报告（F4）

- [x] 6.1 实现 hub 路径解析与布局识别（`<name>/SKILL.md`、`skills/<name>/SKILL.md`），验证单测对两种 fixture 布局得到相同技能集
- [x] 6.2 实现三类差异计算（only-in-hub / only-in-spoke / drift），验证单测覆盖三类且 drift 标注两侧 hash 与 mtime
- [x] 6.3 实现 md / json 两种渲染器，验证 json 输出 schema 稳定（快照测试）且能被 `JSON.parse` 消费，且 diff 执行后技能文件内容与 mtime 不变
- [x] 6.4 实现 `full` 开关（核心层脱敏参数），验证默认输出不含正文、开启后附带正文
- [x] 6.5 实现 hub 为远程 git 时经本机 git 子进程访问，验证测试用本地 bare 仓库模拟克隆成功与失败两条路径

## 7. 集成验证

- [x] 7.1 端到端测试（core API 层）：用临时 HOME 模拟真实四 agent 环境，依次执行 scan → 分类设置 → audit → diff（json），验证全链路无崩溃且写入仅落在临时 HOME
- [x] 7.2 核心引擎（解析/hash/检测/diff）单测覆盖率达到 ≥80%，验证覆盖率报告达标
- [x] 7.3 更新 README.md / README.zh-CN.md（首屏隐私声明：纯本地、零遥测、报告脱敏）与 GitHub issue 模板（勿贴公司路径/敏感技能），验证文档命令与当前能力一致

## 8. CLI 与 npm 分发（里程碑 2，桌面端完成后执行）

- [x] 8.1 初始化 `src/apps/cli` 与 commander 骨架（`--version`/`--help`/未知命令退出码），验证 `node dist/cli.js --help` 列出四个子命令
- [x] 8.2 把 core 能力接线为 `scan` / `classify` / `audit` / `diff` 命令与终端摘要渲染，验证各命令在 fixture 环境输出预期结果
- [x] 8.3 配置 bin（`manage-skills` / `msk`）与 `publint` + `attw`，验证 `npm run check:pkg` 无报错
- [x] 8.4 编写 `docs/adapters.md`、`docs/classify.md`、`docs/audit.md`、`docs/diff.md`，验证文档中的命令示例可原样执行
- [x] 8.5 完成 `npm publish 0.0.1` 占位（需用户完成 npm 邮箱验证与登录），验证 `npm view manage-skills version` 返回 0.0.1

## Workflow follow-up

- 全部任务完成后执行 `openspec archive bootstrap-mvp-cli`，把 delta spec 合并进主规范库。
- 归档前确认 `.bak`、临时 fixture 生成物与本地调试脚本未进入 git。
- 组 8 未完成时，桌面端（`desktop-app`）对 core 的消费即为本 change 的验收方式。
