# 标签

标签是**多维标记**，与单值的分类（category）并存：分类回答「它属于哪一组」，标签回答「它还有哪些属性」。标签只写 sidecar 索引，不改动 `SKILL.md`。

## 有效标签的计算

```text
有效标签 = (frontmatter.tags ∪ 手工 added) - 手工 removed
```

- 统一转小写，去重后排序
- `frontmatter.tags` 是来源；手工操作只记录「加了什么 / 删了什么」
- 让 frontmatter 变化后仍能正确重算，不会丢失用户的手工调整

## 查看标签

```bash
npx manage-skills tag
```

输出按技能数排序：

```text
  42  testing
  18  docs
   7  pdf
```

## 添加 / 移除标签

```bash
# 单个技能
npx manage-skills tag add pdf-toolkit docs

# 移除
npx manage-skills tag remove pdf-toolkit docs
```

`pdf-toolkit` 可以是技能名称或 `SKILL.md` 的绝对路径。支持一次传多个标签。

## 建议标签

系统会根据名称、描述与目录关键词给出建议标签（如 `pdf`、`review`、`testing`），但建议值**不会自动生效**，需要用户手动 `tag add` 采纳。

## 与分类的区别

| | 分类 category | 标签 tags |
| --- | --- | --- |
| 数量 | 单值 | 多值 |
| 来源 | frontmatter > 手工 > 建议 | frontmatter > 手工 |
| 用途 | 分组、导航 | 多维筛选（AND 语义） |

## 存储

- 标签增量保存在 `~/.manage-skills/index.json` 的 `tagState` 字段
- 索引 `schemaVersion` 2 起支持；旧版索引加载时自动补齐为空增量，不丢数据
- 源文件删除后，条目会标记 `stale`，标签记录保留以便追溯