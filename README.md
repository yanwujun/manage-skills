# manage-skills

> Audit, organize and sync your agent skills — across Claude Code, Cursor, Codex and Hermes.

[中文 README](./README.zh-CN.md)

Your skills directories are a mess. Hundreds of `SKILL.md` files piled up across
`~/.claude/skills`, `~/.cursor/skills`, `~/.codex/skills` and more — duplicated,
drifted apart, unclassified, and no tool tells you what you actually have.

**manage-skills** is a local-first, read-only-by-default CLI that governs the skills
you *already own* (not another installer):

- 🔍 **Scan** — full inventory across every detected agent, WSL + Windows/macOS/Linux included
- 🏷️ **Classify** — tag skills with categories via a sidecar index; your files stay untouched unless you explicitly opt in
- 🩺 **Audit** — detect same-name-different-content (drift), different-name-same-content (dupes), broken frontmatter, and name/path conflicts that silently break skill loading
- 📊 **Diff** — hub-and-spoke comparison against a canonical library (local dir or git repo), markdown + JSON reports for CI

## Privacy

100% local. Zero telemetry. Zero network calls (except your own git credentials
when the hub is a remote repo). Reports are redacted by default — skill bodies are
never printed unless you pass `--full`.

## Status

🚧 **Core engine implemented; desktop app and CLI in progress.**

- Engine (`src/packages/core`): scan, classify, audit, hub diff — 106 tests, ~97% line coverage
- Desktop app (Tauri + React): see OpenSpec change [desktop-app](./openspec/changes/desktop-app/proposal.md)
- CLI: milestone 2 — see [bootstrap-mvp-cli](./openspec/changes/bootstrap-mvp-cli/proposal.md) group 8

npm package `manage-skills` is reserved (0.0.1 placeholder published); `npx manage-skills` will work once the CLI ships.

## License

MIT © 2026 yanwujun
