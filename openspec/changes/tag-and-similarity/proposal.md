# Proposal

## Why

现有设计里分类是单值（category），只能回答「它属于哪一组」；`dup` 检测只抓内容 hash 完全相同，改名或小改几行的副本完全漏掉。用户在几百份技能里既无法按多维标签组织资产，也无法发现「其实是同一技能的不同版本」。需要补两层：**扁平标签**做多维标记，**本地相似度**发现近似重复。

## What Changes

- 新增扁平标签体系：每个技能可有多值标签，来源优先级为 frontmatter `tags` > sidecar 手工标签 > 规则建议值（`suggested`），只写 sidecar，不改源文件。
- 新增标签操作：单条/批量打标与移除、按标签筛选、标签计数与标签云数据。
- 新增相似度检测：对技能文本做归一化后提取词与字符 3-gram 特征，用 MinHash + LSH 生成候选对，再用 Jaccard 精确计算；描述与正文共同参与，纯本地计算、零网络。
- 审计新增 `similar` 类别：输出高置信近似重复组（默认 Jaccard ≥0.8），0.6~0.8 在界面按分数展示，不自动合并。
- 新增「不是重复」忽略机制：用户可将某对技能标记为永久忽略，存于 sidecar。
- 桌面端新增两个视图：标签筛选/标签云，以及相似组审查（组内分数、并排摘要、加入同步队列或标记忽略）。
- 非目标：层级标签、语义向量模型、自动合并执行、跨语言语义相似。

## Capabilities

### New Capabilities

- `skill-tagging`: 扁平标签的数据模型与操作——来源优先级、批量打标、筛选、计数。
- `similarity-detection`: 相似度计算与相似组——文本归一化、特征提取、MinHash/LSH 候选、Jaccard 判定、阈值与忽略规则、审计集成。
- `similarity-review`: 相似组与标签筛选的界面行为——标签云、按标签筛选、相似组展示与操作入口。

### Modified Capabilities

（无。`bootstrap-mvp-cli` 的 F2/F3 行为不变，本 change 在其上新增能力。）

## Impact

- 新增 `src/packages/core` 模块：`tagging`（标签读写与优先级）、`similarity`（归一化/特征/MinHash/LSH/Jaccard）。
- 索引扩展：`index.json` 的技能条目新增 `tags` 字段；相似组结果单独缓存（`similarity.json`），随内容 hash 失效。
- 审计扩展：`Finding` 新增 `similar` 类型，报告渲染同步支持。
- 桌面端扩展：新增「标签」与「相似组」两个视图，复用现有卡片与详情组件。
- 性能：500 份技能、平均 4KB 文本下，全量相似度计算目标 < 5 秒；LSH 用于避免 O(n²) 精算。
- 隐私：全部本地计算，不调用任何模型或网络接口。
