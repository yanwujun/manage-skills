# Spec Delta

## Purpose

把每个技能内容的每一次变化记录成可回溯的版本历史：按路径保留事实、按名称聚合展示、按哈希保存全文快照，让作者知道改过哪几版、每版是什么，并能随时取回旧版做对比。

## ADDED Requirements

### Requirement: 内容变更自动记录历史

系统 SHALL 在扫描时对比同一路径上一次记录的 hash；当 hash 不同或该路径尚无历史时，自动追加一条历史条目。记录历史 MUST NOT 修改任何技能源文件。

#### Scenario: 内容变化追加条目

- **WHEN** 某路径的 SKILL.md 内容 hash 与历史中最近一条不同
- **THEN** 系统为该路径追加一条历史条目，记录新 hash 与新快照

#### Scenario: 内容未变不追加

- **WHEN** 某路径的 SKILL.md 内容 hash 与历史中最近一条相同
- **THEN** 系统不追加任何条目

#### Scenario: 首次收录建立基线

- **WHEN** 某路径首次出现在扫描结果中且没有历史
- **THEN** 系统追加一条 `cause: scan` 的基线条目

### Requirement: 历史条目包含版本事实与变更来源

每条历史条目 SHALL 记录快照引用、内容 hash、frontmatter version（可为空）、文件 mtime、字节大小、变更原因与可选变更说明。变更原因 MUST 取 `scan`、`sync`、`bump` 之一。

#### Scenario: 同步产生的变更标记来源

- **WHEN** 同步执行写入了某技能的新内容，随后扫描检测到该变化
- **THEN** 该条目记录的变更原因为 `sync`

#### Scenario: 版本升号产生条目

- **WHEN** 用户执行 `msk version bump` 并确认写入
- **THEN** 系统追加一条原因为 `bump` 且携带变更说明的条目

### Requirement: 全文快照按内容寻址保存

系统 SHALL 为每条历史条目保存当时的技能全文，快照以内容 sha256 命名；相同内容 MUST 只保存一份。快照内容 SHALL 可被读取用于版本回放。

#### Scenario: 相同内容去重

- **WHEN** 两个不同技能或两个版本的内容完全相同
- **THEN** 系统只保存一份快照，历史条目共享引用

#### Scenario: 取回旧版全文

- **WHEN** 用户或评测按历史条目请求某版本全文
- **THEN** 系统返回该版本保存的完整内容

### Requirement: 版本历史按路径查询

系统 SHALL 提供按文件路径列出与展示历史的能力；展示 SHALL 包含时间、版本号、hash 短码、大小与相对上一版的差异统计。默认输出 MUST NOT 包含技能正文。

#### Scenario: 展示单技能时间线

- **WHEN** 用户查询某个技能的历史
- **THEN** 输出按时间倒序的版本列表，每版含版本号、hash 短码与差异统计

#### Scenario: 默认脱敏

- **WHEN** 用户查询历史且未显式要求完整内容
- **THEN** 输出不含任何技能正文

### Requirement: 按技能名称聚合视图

系统 SHALL 提供按技能名称聚合的时间线，把不同路径上的同名技能放在同一视图；每条记录 MUST 标注来源路径，且 MUST NOT 把不同路径的版本合并成单一线性演进。

#### Scenario: 同名不同内容并列展示

- **WHEN** 两个 agent 下的同名技能内容不同且都有历史
- **THEN** 聚合视图同时展示两条来源路径的记录，并标注各自路径

### Requirement: 显式版本升号

系统 SHALL 提供显式升号命令，按 `patch` / `minor` / `major` 递增 frontmatter 的 `version`；执行前 MUST 展示变更预览，写入前 MUST 备份为 `.bak` 并校验文件未被并发修改，只允许改写 `version` 行。

#### Scenario: 按补丁位递增

- **WHEN** 当前版本为 `1.2.3` 且用户选择 `patch`
- **THEN** 预览显示新版本 `1.2.4`，确认后写入源文件并保留 `.bak`

#### Scenario: 缺失版本号时建立初版

- **WHEN** frontmatter 没有 `version` 字段
- **THEN** 预览显示将写入 `0.1.0`，确认后写入

#### Scenario: 版本号不可解析时中止

- **WHEN** 当前 `version` 不是三段式语义化版本
- **THEN** 系统报错并中止写入，提示用户手工处理

#### Scenario: 预览后文件被改动

- **WHEN** 预览生成后、写入前源文件内容发生变化
- **THEN** 系统中止写入且不修改文件

### Requirement: 版本历史保留与清理

系统 SHALL 支持清理指定技能的历史，并回收不再被任何历史或评测结果引用的快照；清理前 MUST 要求确认。

#### Scenario: 清理指定技能历史

- **WHEN** 用户确认清理某技能历史
- **THEN** 该技能的条目被移除，其独占快照被回收，共享快照保留

#### Scenario: 共享快照不被误删

- **WHEN** 某快照仍被其他技能的历史或评测结果引用
- **THEN** 回收过程保留该快照
