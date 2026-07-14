# dont-repeat

**Stop paying AI coding agents to make the same mistake twice.**

Local, structured **failure & decision memory** for Claude Code, Codex, Gemini CLI, OpenCode, Cursor, and any tool that reads a project instruction file.

```bash
npm install -g dont-repeat
# or without global install:
npx dont-repeat init

cd your-project
dont-repeat init
dont-repeat log failure "do not use jest for e2e — use playwright"
```

Agents then read a small, budgeted `.agent-memory/MEMORY.md` every session.

[![npm](https://img.shields.io/npm/v/dont-repeat)](https://www.npmjs.com/package/dont-repeat)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

---

## Why this exists

Tools like RTK compress shell noise. Graphify maps code structure. **Nothing good remembers what already failed.**

Every new agent session still retries dead-end fixes and re-discovers project gotchas.

`dont-repeat` is **failure-first project memory** — not a chat dump, not a cloud brain.

| Layer | Tool | Role |
|--------|------|------|
| Shell output | RTK | Compress command noise |
| Code map | Graphify | Navigate structure |
| **Lessons** | **dont-repeat** | **Don’t retry known failures** |
| Spend | ccusage | See where tokens went |

---

## How it works

```
.agent-memory/
  store.json     # source of truth (structured entries)
  MEMORY.md      # compact inject file (token-budgeted)

CLAUDE.md / AGENTS.md / GEMINI.md
  └── managed pointer → read MEMORY.md
```

1. You (or MCP / distill) **log** failures, decisions, commands, gotchas  
2. `dont-repeat` **ranks** by importance under a token budget  
3. Agents **load** `MEMORY.md` via their normal instruction files  

Default budget: **~600 tokens**. Failures and `do_not` win over facts.

---

## Install

```bash
npm install -g dont-repeat
```

From source:

```bash
git clone https://github.com/xCaptaiN09/dont-repeat.git
cd dont-repeat && npm install && npm run build && npm link
```

Requires **Node.js 18+**.

---

## Quick start

```bash
cd my-project
dont-repeat init                    # wires all agents
# or: dont-repeat init --agents claude,codex,gemini

dont-repeat log failure "never rewrite package-lock by hand"
dont-repeat log decision "auth lives in src/lib/session.ts" -p src/lib/session.ts
dont-repeat log command "pnpm test:e2e needs redis on 6379" -t tests
dont-repeat log gotcha "CI uses Node 20; local Node 22 breaks sharp"
dont-repeat log do_not "do not commit .env"

dont-repeat status
dont-repeat doctor
dont-repeat search auth
```

### Distill a session (no API key)

```bash
# preview candidates
dont-repeat distill examples/session-notes.txt

# save into the store
dont-repeat distill examples/session-notes.txt --apply

# or pipe notes
echo "FAILURE: do not mock the DB in integration tests" | dont-repeat distill --apply
```

Tagged lines work best: `FAILURE:`, `DECISION:`, `GOTCHA:`, `COMMAND:`.

### MCP (Claude Code / Cursor)

```bash
dont-repeat mcp
```

Example MCP config snippet:

```json
{
  "mcpServers": {
    "dont-repeat": {
      "command": "dont-repeat",
      "args": ["mcp"]
    }
  }
}
```

Tools: `memory_log`, `memory_search`, `memory_list`, `memory_status`, `memory_render`.

### Commands

| Command | What it does |
|---------|----------------|
| `init` | Create store, `MEMORY.md`, agent adapters |
| `log <type> <summary>` | Add memory |
| `list` / `search` | Browse memories |
| `forget <id>` | Expire an entry |
| `render` | Rebuild `MEMORY.md` |
| `status` | Token + entry summary |
| `doctor` | Health check + wiring |
| `distill [file]` | Extract lessons from notes/transcript |
| `mcp` | MCP stdio server |
| `budget <n>` | Set token budget |
| `path` | Print paths |

Memory types: `failure` · `do_not` · `decision` · `gotcha` · `command` · `fact`

---

## Agent support

| Agent | How memory loads | Hooks |
|--------|------------------|--------|
| **Claude Code** | `CLAUDE.md` | SessionStart, PreCompact, Stop |
| **Codex CLI** | `AGENTS.md` | Load |
| **Gemini CLI** | `GEMINI.md` | Load |
| **OpenCode** | `AGENTS.md` (+ `opencode.json`) | Load |
| **Cursor** | `AGENTS.md` + `.cursor/rules` | Load |
| **Anything else** | Point at `.agent-memory/MEMORY.md` | Manual |

```bash
dont-repeat init --agents all
dont-repeat init --agents claude,codex
```

---

## Demo

```bash
npm run build && npm link
bash scripts/demo.sh
```

---

## Privacy

- **Local only** — no cloud, no account, no telemetry  
- `.agent-memory/` is gitignored by default  
- Share a sanitized copy only if *you* choose  

---

## Example `MEMORY.md`

```markdown
# Project memory (dont-repeat)

## Failures (do not retry blindly)
- **failure**: do not use jest for e2e — use playwright [tests]

## Decisions
- **decision**: auth in src/lib/session.ts
```

---

## Roadmap

- [x] Structured store + token-budgeted render  
- [x] Multi-agent init  
- [x] Claude Code hooks (SessionStart / PreCompact)  
- [x] Distill from notes/transcripts  
- [x] MCP server  
- [x] Doctor  
- [ ] Smarter LLM-assisted distill (optional)  
- [ ] Shared team memory (opt-in)  

---

## Credits

Built by **[Muhammed Dilshad A](https://github.com/xCaptaiN09)** ([@xCaptaiN09](https://github.com/xCaptaiN09)).

If this saves you a wasted session, star the repo.

---

## License

[MIT](./LICENSE) © 2026 Muhammed Dilshad A (xCaptaiN09)
