# Tasks

## 1. 历史存储与快照

- [x] 1.1 在 core 定义 `HistoryEntry` 类型与 `history.jsonl` 读写模块（追加、读取全量、按路径筛选），验证：单元测试覆盖追加后读取与字段完整性
- [x] 1.2 实现内容寻址快照存储 `blobs/<sha256>.md`（写入前按 hash 判重、按 hash 读取），验证：同内容两次写入只产生一个文件
- [x] 1.3 为缺失目录自动创建 `~/.manage-skills` 子目录，验证：空目录首次写入成功且不覆盖已有文件

## 2. 扫描集成

- [x] 2.1 实现 `scan` 后的历史对账：逐路径对比最后一条条目，hash 不同或不存在则追加 `cause: scan`，验证：单测覆盖「变化追加 / 未变不追加 / 首次建立基线」三种情况
- [x] 2.2 接入 CLI `scan` 命令并在终端摘要中输出本次新增历史条目数与 `version-drift` 数量，验证：构造改动后执行 `scan`，摘要数字与实际条目一致
- [x] 2.3 验证 `scan` 仍不修改任何技能源文件：记录执行前后源文件 mtime 与内容 hash 一致

## 3. 同步与升号来源

- [x] 3.1 `sync apply` 成功后按计划中实际写入的目标路径追加 `cause: sync` 条目，验证：同步测试中断言条目来源为 `sync` 且随后 `scan` 不产生重复条目
- [x] 3.2 扩展 frontmatter 回写能力为按字段名改写，支持 `version`，验证：单测覆盖「有 version 替换 / 无 version 新增 / 其他行不变」
- [x] 3.3 实现 `msk version bump <技能> --kind patch|minor|major [--note]`：预览 → 确认 → `.bak` → 原子写，验证：`1.2.3` + patch 预览为 `1.2.4`，确认后文件只改 version 行且生成 `.bak`
- [x] 3.4 处理边界：缺失 version 写入 `0.1.0`、非三段式版本报错中止、预览后文件被改动则中止，验证：三个场景各有单测
- [x] 3.5 升号成功后追加 `cause: bump` 条目并写入 `--note`，验证：`history` 输出中该条目来源与说明正确

## 4. 审计集成

- [x] 4.1 扩展审计输入为「索引 + 路径最新历史条目映射」，新增 `version-drift` finding，验证：单测覆盖「内容变版本未变 / 二者都变 / 版本缺失 / 无基线」
- [x] 4.2 更新文本与 JSON 报告渲染，验证：`audit --json` 输出含 `version-drift` 且默认不含技能正文
- [x] 4.3 同步更新 `docs/audit.md` 的检测类别表与处理建议，验证：文档命令按写法可执行

## 5. 历史查询

- [x] 5.1 实现 `msk history [--name <name>]` 路径事实视图，验证：输出含时间、版本、hash 短码、大小、差异统计且不含正文
- [x] 5.2 实现 `msk history show <技能>` 按名称聚合视图，验证：同名两路径同时展示并标注各自路径，顺序不合并为线性演进
- [x] 5.3 差异统计复用文本 diff 工具按需计算，验证：修改两行后展示 `+2 -0` 类统计与快照内容一致
- [x] 5.4 新增 `docs/history.md` 并在 README 补充命令说明与「工具不修改源文件」边界，验证：按文档命令实际执行通过

## 6. 清理与回收

- [x] 6.1 实现 `msk history purge <技能>`：确认后移除该技能条目并回收其独占快照，验证：共享快照仍被其他条目引用时保留
- [x] 6.2 实现无引用快照回收（含对 `evals/results/*.json` 引用的保护），验证：删除唯一引用后快照被回收，存在评测引用时不回收

## 7. 集成验证

- [x] 7.1 跑通 `npm test`、`npm run typecheck`、`npm run lint`，验证：三项全部通过
- [x] 7.2 端到端手工流程：`scan` → 修改一个技能 → `scan`（出现 version-drift）→ `history show` → `version bump` → `audit`，验证：每步输出符合规格且源文件仅在 bump 时变化
- [x] 7.3 在 Windows 与 WSL 路径下各执行一次历史写入与查询，验证：路径编码与换行差异不产生解析错误

## Workflow follow-up

- 按项目要求完成评审后归档该 change，并执行 `openspec archive skill-version-history` 验证归档结果。
