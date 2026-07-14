# dont-repeat

**Stop paying AI coding agents to make the same mistake twice.**

Local, structured **failure & decision memory** for Claude Code, Codex, Gemini CLI, OpenCode, Cursor, and any tool that reads a project instruction file.

```bash
npm i -g dont-repeat   # or: npx dont-repeat
cd your-project
dont-repeat init
dont-repeat log failure "do not use jest for e2e — use playwright"
```

Agents then read a small, budgeted `.agent-memory/MEMORY.md` every session.

---

## Why this exists

Tools like RTK compress shell noise. Graphify maps code structure. **Nothing good remembers what already failed.**

Every new agent session still:

- retries dead-end fixes  
- re-discovers project gotchas  
- ignores last week’s decisions  

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

1. You (or a hook) **log** failures, decisions, commands, gotchas  
2. `dont-repeat` **ranks** by importance under a token budget  
3. Agents **load** `MEMORY.md` via their normal instruction files  

Default budget: **~600 tokens**. Failures and `do_not` win over facts.

---

## Install

```bash
# From npm (after publish)
npm install -g dont-repeat

# From source
git clone https://github.com/xCaptaiN09/dont-repeat.git
cd dont-repeat
npm install
npm run build
npm link
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
dont-repeat log gotcha "CI is Node 20; local Node 22 breaks sharp"
dont-repeat log do_not "do not commit .env"

dont-repeat status
dont-repeat search auth
dont-repeat list --type failure
```

### Commands

| Command | What it does |
|---------|----------------|
| `init` | Create store, `MEMORY.md`, agent adapters |
| `log <type> <summary>` | Add memory (`failure`, `do_not`, `decision`, `gotcha`, `command`, `fact`) |
| `list` | Show entries |
| `search <query>` | Full-text-ish search |
| `forget <id>` | Expire an entry (prefix ok) |
| `render` | Rebuild `MEMORY.md` |
| `status` | Health + token estimate |
| `budget <n>` | Set token budget |
| `path` | Print paths |

### Log options

```bash
dont-repeat log failure "summary" \
  -d "extra detail" \
  -t tests,ci \
  -p src/foo.ts,src/bar.ts
```

---

## Agent support

| Agent | How memory loads | Auto hooks |
|--------|------------------|------------|
| **Claude Code** | `CLAUDE.md` + SessionStart hook | Yes |
| **Codex CLI** | `AGENTS.md` | Load only |
| **Gemini CLI** | `GEMINI.md` | Load only |
| **OpenCode** | `AGENTS.md` (+ `opencode.json` if present) | Load only |
| **Cursor** | `AGENTS.md` + `.cursor/rules/dont-repeat.mdc` | Load only |
| **Anything else** | Point it at `.agent-memory/MEMORY.md` | Manual |

```bash
dont-repeat init --agents all
dont-repeat init --agents claude,codex
```

**Honest model:** every serious coding CLI can **read** markdown instructions → memory loads everywhere. Deep auto-distill from transcripts is Claude-first; more adapters later.

---

## Privacy

- **Local only** — no cloud, no account, no telemetry  
- `.agent-memory/` is added to `.gitignore` by default  
- Share a sanitized copy only if *you* choose to commit it  

---

## Example `MEMORY.md`

```markdown
# Project memory (dont-repeat)

> Auto-generated. Do **not** re-attempt listed **failure** / **do_not** items.

## Failures (do not retry blindly)
- **failure**: do not use jest for e2e — use playwright [tests]

## Decisions
- **decision**: auth in src/lib/session.ts (src/lib/session.ts)

## Working commands
- **command**: pnpm test:e2e needs redis on 6379 [tests]
```

---

## Roadmap

- [x] Structured store + token-budgeted render  
- [x] Multi-agent init (Claude, Codex, Gemini, OpenCode, Cursor)  
- [x] Claude Code SessionStart hook  
- [ ] Transcript **distill** → auto entries  
- [ ] MCP server (`memory_search` / `memory_add`)  
- [ ] PreCompact re-inject for long Claude sessions  
- [ ] Shared team memory (opt-in, sanitized)

PRs welcome.

---

## Name

`dont-repeat` — as in *don’t repeat the same agent failure*.  
Not affiliated with unrelated DRY libraries of the same phrase.

---

## Credits

Built by **[Muhammed Dilshad A](https://github.com/xCaptaiN09)** ([@xCaptaiN09](https://github.com/xCaptaiN09)).

If this saves you a wasted session, star the repo and tell another agent user.

---

## License

[MIT](./LICENSE) © 2026 Muhammed Dilshad A (xCaptaiN09)
