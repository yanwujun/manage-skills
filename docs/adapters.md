# Agent 适配器

manage-skills 内置四个 agent 适配器，启动时按固定目录表探测实例；新增 agent 只需扩展适配器元数据，不改扫描引擎。

## 目录表

| Agent | 全局技能目录 | 项目级目录 | 备注 |
| --- | --- | --- | --- |
| Claude Code | `~/.claude/skills/<name>/SKILL.md` | `.claude/skills/` | `.claude/commands` 被识别但不计入技能 |
| Cursor | `~/.cursor/skills/<name>/SKILL.md` | `.cursor/skills/` | `.cursor/rules/*.mdc` 被识别但不计入技能 |
| Codex | `~/.codex/skills/<name>/SKILL.md` | `.agents/skills/` | — |
| Hermes | `~/.hermes/skills/[<category>/]<name>/SKILL.md` | 无 | 支持 frontmatter `category`；枚举 `~/.hermes/profiles/<p>/skills/` |

技能识别标准：目录树中任意位置名为 `SKILL.md` 的文件（最大递归深度 4）。

## WSL 桥接

在 WSL 中运行时，除本机 `~` 下的目录外，还会探测 `/mnt/c/Users/<user>/.claude|.cursor|.codex|.hermes`，并标记为 `windows-wsl-bridge` 实例。

Windows 侧桌面端（后续）从 `\\wsl$\<distro>\...` 反向探测，共用同一份已知路径表。

## 自定义扫描根与排除

配置文件：`~/.manage-skills/config.json`

```json
{
  "scanRoots": [
    { "path": "/data/shared-skills", "agent": "custom", "label": "团队共享库" }
  ],
  "exclude": [
    "/home/me/old-skills"
  ]
}
```

- `scanRoots`：追加扫描根，路径不存在时给出警告并跳过，不中断扫描
- `exclude`：按目录前缀排除（命中子目录同样排除）
- 与内置路径重复的配置项自动去重

## 验证

```bash
npx manage-skills scan --cwd .
```

输出示例：

```text
实例 4 · 技能 158 · 无效 3 · 过期 0 · 耗时 0.4s
索引：/home/me/.manage-skills/index.json
```