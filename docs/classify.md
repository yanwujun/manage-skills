# 分类管理

分类只写 sidecar 索引（`~/.manage-skills/index.json`），默认不改动任何 `SKILL.md`。只有显式 `--write-frontmatter` 才会回写源文件。

## 分类来源优先级

1. `SKILL.md` frontmatter 中的 `category`（最高）
2. sidecar 手工标注（`classify set` 写入）
3. 基于名称、描述与目录的关键词建议值（标记为 `suggested`，不自动生效）

## 查看分类

```bash
npx manage-skills classify
```

输出按技能数排序：

```text
  42  testing
  18  documents
   7  database
```

## 设置分类

```bash
npx manage-skills classify set pdf-toolkit --category documents
```

- `pdf-toolkit` 可以是技能名称，也可以是 `SKILL.md` 的绝对路径
- 只更新索引，不改源文件

## 回写 frontmatter

```bash
# 预览将写入的内容，不写盘
npx manage-skills classify set pdf-toolkit --category documents --write-frontmatter --dry-run

# 确认后实际写入（自动生成 .bak 备份）
npx manage-skills classify set pdf-toolkit --category documents --write-frontmatter
```

- 已有 `category` 行时替换，没有时追加；文件没有 frontmatter 时在文件头新建
- 写入前会校验文件在预览后未被修改，否则中止
- 备份文件为 `<SKILL.md>.bak`，可直接复制回滚

## 注意事项

- `suggested` 值只是提示，不会参与实际分类统计的「已确认」判断
- 分类存于索引；删除索引后需要重新 `scan` 并重新标注