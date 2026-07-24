# Changelog

## 0.6.0 — 2026-07-18

### Automatic-first
- Stronger self-log rules in all instruction files (agents own logging)
- Claude Code: PostToolUseFailure hook auto-logs failed tools
- Claude Code: Stop hook best-effort distill from last message
- Claude Code: `.claude/rules/dont-repeat.md` always-on
- Cursor rule rewritten for automatic self-logging + MCP
- `log -q` / `distill -q` + duplicate suppression for hooks
- README + guide: **init once, work normally** (manual log is optional)

## 0.5.1 — 2026-07-18

### Fixed
- Stop generating opencode.json (OpenCode crash)

## 0.5.0 / 0.4.0 — 2026-07-18

- Auto MCP for Claude/Cursor; automatic self-logging instructions

## 0.3.0 — 2026-07-17

### Added
- Maximum agent coverage: `agy` (antigravity), `hermes`, `kimi`, `qwen`, `openclaw`, `zcode`, `aider`, `windsurf`, `copilot`
- Aliases (`antigravity`→`agy`, `claude-code`→`claude`, …)
- `.agent-memory/HOW_TO_CONNECT.md` on every `init` — how any unsupported CLI can still use memory
- README sections: full support matrix + “Unsupported CLI? Still works”

### Improved
- `dont-repeat guide` and `init --help` list all agents + fallback path

## 0.2.1 — 2026-07-16

### Improved
- Richer `dont-repeat --help` with quick-start examples
- New `dont-repeat guide` beginner walkthrough
- Per-command examples (`help log`, `help distill`, …)
- Polished README: install, setup, usage, FAQ, TOC

## 0.2.0 — 2026-07-14

### Added
- `dont-repeat distill` — rule-based extraction from notes/transcripts (`--apply`)
- `dont-repeat doctor` — health checks for store + agent wiring
- `dont-repeat mcp` — MCP stdio server (`memory_log`, `memory_search`, `memory_list`, `memory_status`, `memory_render`)
- Claude Code **PreCompact** hook (re-render MEMORY.md)
- Example notes + demo script

### Improved
- Multi-agent init notes and hook coverage

## 0.1.0 — 2026-07-14

### Added
- Initial release: store, ranker, MEMORY.md render
- CLI: init, log, list, search, forget, render, status, budget, path
- Adapters: Claude Code, Codex, Gemini, OpenCode, Cursor, generic
