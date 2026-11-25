# Hub 对比

把本地各 agent 实例（spoke）与权威库（hub）做只读对比，输出三类差异。hub 可以是本地目录，也可以是 git 仓库。

## Hub 布局

两种常见布局都会自动识别：

```text
# 根级布局
hub/
  pdf-toolkit/SKILL.md
  code-review/SKILL.md

# skills 子目录布局
hub/
  skills/
    pdf-toolkit/SKILL.md
    code-review/SKILL.md
```

## 三类差异

| 类别 | 含义 |
| --- | --- |
| `only-in-hub` | 只存在于权威库，spoke 中没有 |
| `only-in-spoke` | 只存在于某个 agent 实例，权威库中没有 |
| `drift` | 两边同名但内容 hash 不同 |

## 执行对比

```bash
# markdown 报告（默认脱敏）
npx manage-skills diff --hub ~/skills-hub

# JSON 报告，供 CI 消费
npx manage-skills diff --hub ~/skills-hub --format json

# 附带技能正文（谨慎使用）
npx manage-skills diff --hub ~/skills-hub --full
```

## 远程 hub

```bash
npx manage-skills diff --hub https://github.com/you/skills-hub.git
```

- 首次访问克隆到 `~/.manage-skills/cache/hub/`，后续 `pull` 更新
- 只调用本机 `git`，不自建网络客户端、不采集遥测
- 仓库不可达时直接报错，不生成残缺报告

## CI 用法

```bash
npx manage-skills scan
npx manage-skills diff --hub https://github.com/you/skills-hub.git --format json > diff.json
```

JSON 顶层字段固定为：`generatedAt`、`hubRoot`、`layout`、`full`、`onlyInHub`、`onlyInSpoke`、`drift`、`counts`。

## 与同步的关系

`diff` 只产出报告，不写任何文件。后续的同步能力（OpenSpec change `sync-engine`）会复用同一份差异模型生成执行计划。