# Design

## Context

现有 `scan` 把每个技能的当前状态写入 `~/.manage-skills/index.json`，`mergeScan` 用新记录整条覆盖旧记录，历史信息在扫描后即丢失。core 已具备：frontmatter 解析（含 `version`）、sha256 工具、注入式文件系统接口（`FileSystem` / `FileSystemReader`）、以及分类回写使用的「预览 → 校验未变 → `.bak` → 原子替换」写入模式（`planFrontmatterWrite` / `applyFrontmatterWrite`）。详见 proposal.md。

## Goals / Non-Goals

**Goals:**

- 版本历史独立于索引存储，索引结构不变，旧索引可直接使用。
- 记录行为全部发生在中央库，源文件在 `scan` 与 `history` 路径下保持只读。
- 历史数据为后续 `skill-eval` 提供按快照回放旧版全文的能力。

**Non-Goals:**

- 不自动升版：内容变化只记录与提示，写入 `version` 必须显式执行升号命令。
- 不引入 git 集成、内容 blame 或跨机器同步。
- 不覆盖 command / hook 等其他资源类型，仅 `SKILL.md`。
- 不做桌面端视图（留待 `desktop-app` 后续）。

## Decisions

### D1 存储布局：单个追加式 `history.jsonl` + 内容寻址快照

```text
~/.manage-skills/
  history.jsonl            # 每行一条 HistoryEntry，追加写
  blobs/<sha256>.md        # 技能全文快照，同内容只存一份
```

选择单文件而非「每路径一个文件」：读聚合视图只需一次顺序读；条目为轻量元数据（约 200 字节），500 技能 × 数十版仍在数 MB 级。`purge` 为低频操作，采用「读全量 → 过滤 → 临时文件 → 原子替换」。

快照 id 直接复用内容 sha256，条目通过 `hash` 引用快照，无需额外引用表，回收时以「被任何条目或 `evals/results/*.json` 引用」为存活条件。

### D2 历史条目结构

```ts
interface HistoryEntry {
  path: string;          // SKILL.md 绝对路径（事实主键）
  instanceId: string;
  agent: AgentId;
  name?: string;         // frontmatter name，用于聚合
  hash: string;          // 内容 sha256，同时是快照 id
  size: number;
  mtimeMs: number;
  version?: string;      // frontmatter version
  cause: 'scan' | 'sync' | 'bump';
  note?: string;
  recordedAt: string;    // ISO 时间
}
```

不存 `previousHash`：路径内的上一条即前序，避免双写不一致。

### D3 记录时机：扫描后对账，sync 与 bump 主动写入

- `scan` 完成后，core 的 `recordHistory(fs, entries, previous)` 对比每路径最后一条：hash 不同或不存在则追加，`cause: scan`。首次扫描为所有技能建立基线条目。
- `sync` 执行成功后，按计划中实际写入的目标路径主动追加 `cause: sync` 条目（内容取自 hub 源文件，hash 已知），随后的 `scan` 不再重复记录。
- `version bump` 确认写入后追加 `cause: bump` 条目并携带 `--note`。

选择「sync 主动写」而非「等下次 scan 猜」：扫描无法区分变化来自作者编辑还是工具同步，来源标记必须在写操作发生处产生。

### D4 升号规则：严格三段式语义化版本

`version bump` 只接受 `^\d+\.\d+\.\d+$`；缺失时初版取 `0.1.0`；不可解析时报错中止，不做猜测性修复。写入复用 `write-frontmatter.ts` 的预览/备份/原子替换机制，扩展为按字段名改写（当前仅支持 `category`）。

### D5 审计集成：`version-drift` 以「当前版本段首条」为基线

`audit` 现有输入只有索引；本 change 让 CLI 额外读取历史并把条目数组传给审计。判定不能取「当前记录 vs 最近一条历史」——`scan` 会把本次变化立即写入历史，最近一条恒等于当前内容，永远判不出漂移。正确口径：对每个路径取**当前 version 段的第一条历史**作基线，若段内最新内容 hash 与基线不同，即为漂移；版本段内改回基线内容则不报。无历史（首次收录）不报。`scan` 摘要对同一历史集合复用该判定，只统计本次扫描到的路径。

### D6 查询视图：路径事实与名称聚合分离

`msk history [--name <name>]` 输出路径事实视图；`msk history show <技能>` 按 `name`（缺省回退到目录名）聚合，每行展示来源路径、时间、版本、hash 短码、差异统计。聚合只做并排，不推断先后关系；时间相同按路径排序，避免展示顺序被误读成演进顺序。

### D7 差异统计在读取时计算

历史不预存 diff：展示时取条目快照与其前一条快照，用现有 `utils/text-diff.ts` 计算增删行数。存储最简，代价是展示时多读一份快照。

## Risks / Trade-offs

- [history.jsonl 无限增长] → 条目轻量 + `purge`；后续如超预期可在索引侧加分页，不影响条目格式。
- [快照包含密钥类内容] → 快照仅存本地、沿用 `~/.manage-skills` 权限；`history show` 默认不输出正文；提供 `purge` 清理。
- [并发扫描导致重复条目] → 追加前重读文件末条做去重；本地 CLI 场景冲突概率低，接受该风险。
- [sync 主动写条目与随后扫描的时间差] → 以 hash 判定而不是时间，重复扫描不会产生第二条。
- [首次扫描一次性写入数百条] → 属预期基线；追加写为顺序 IO，单次耗时在毫秒级。
- [版本号语义由用户承担] → 工具不判断 patch/minor/major 是否合理，只保证递增与可追溯；`--note` 承担「为什么改」。
