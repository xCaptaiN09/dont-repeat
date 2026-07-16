# dont-repeat

### Stop AI coding agents from making the same mistake twice.

Local **failure & decision memory** for Claude Code, Codex, Gemini CLI, OpenCode, Cursor, and similar tools.

No cloud. No account. No API key required.

[![npm version](https://img.shields.io/npm/v/dont-repeat)](https://www.npmjs.com/package/dont-repeat)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

```bash
npm install -g dont-repeat
cd your-project
dont-repeat init
dont-repeat log failure "do not use jest for e2e — use playwright"
```

Need help in the terminal?

```bash
dont-repeat --help     # commands + examples
dont-repeat guide      # full beginner walkthrough
dont-repeat help log   # help for one command
```

---

## Table of contents

1. [What problem this solves](#what-problem-this-solves)
2. [Install](#install)
3. [Setup (2 minutes)](#setup-2-minutes)
4. [Everyday usage](#everyday-usage)
5. [Command reference](#command-reference)
6. [How it works](#how-it-works)
7. [Supported agents](#supported-agents)
8. [Distill notes into memory](#distill-notes-into-memory)
9. [MCP (optional)](#mcp-optional)
10. [Privacy](#privacy)
11. [FAQ](#faq)
12. [Credits](#credits)

---

## What problem this solves

AI coding agents are powerful — and forgetful.

Every new session they may:

- retry a fix that already failed  
- re-discover the same project gotcha  
- ignore a decision you made last week  

**dont-repeat** keeps a small, local notebook of:

| Type | Meaning | Example |
|------|---------|---------|
| `failure` | Don’t try this again | “do not use jest for e2e — use playwright” |
| `do_not` | Hard rule | “do not commit `.env`” |
| `decision` | Choice you already made | “auth lives in `session.ts`” |
| `gotcha` | Easy to forget | “CI is Node 20 only” |
| `command` | What works | “`pnpm test:e2e` needs redis” |
| `fact` | Stable project fact | “monorepo uses pnpm workspaces” |

Your agent reads that notebook at the start of the next session.

---

## Install

**Requirements:** [Node.js](https://nodejs.org) 18 or newer.

### Option A — npm (recommended)

```bash
npm install -g dont-repeat
```

### Option B — one-off (no global install)

```bash
npx dont-repeat@latest guide
```

### Option C — from source

```bash
git clone https://github.com/xCaptaiN09/dont-repeat.git
cd dont-repeat
npm install
npm run build
npm link
```

### Check it works

```bash
dont-repeat --version
dont-repeat --help
dont-repeat guide
```

---

## Setup (2 minutes)

Do this **once per project**:

```bash
cd your-project
dont-repeat init
```

That will:

1. Create `.agent-memory/` (your private memory store)  
2. Write `.agent-memory/MEMORY.md` (what agents read)  
3. Wire instruction files for common tools (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, Cursor rules, …)  
4. Add `.agent-memory/` to `.gitignore`  

### Only wire some tools

```bash
dont-repeat init --agents claude,codex
# available: claude, codex, gemini, opencode, cursor, generic, all
```

### Verify setup

```bash
dont-repeat doctor
dont-repeat status
```

You should see green checks from `doctor`.

---

## Everyday usage

### 1. Log a lesson when something goes wrong

```bash
dont-repeat log failure "do not use jest for e2e — use playwright"
dont-repeat log decision "auth lives in src/lib/session.ts"
dont-repeat log command "pnpm test:e2e needs redis on 6379" -t tests
dont-repeat log do_not "do not commit .env"
dont-repeat log gotcha "CI uses Node 20; local Node 22 breaks sharp"
```

Optional flags:

```bash
dont-repeat log failure "summary here" \
  -d "extra detail" \
  -t tests,ci \
  -p src/foo.ts
```

### 2. Browse what you saved

```bash
dont-repeat list
dont-repeat list --type failure
dont-repeat search auth
dont-repeat status
```

### 3. Keep using your coding agent

Open **Claude Code**, **Codex**, **Gemini CLI**, **OpenCode**, or **Cursor** in the same project.

They are pointed at `.agent-memory/MEMORY.md` via the files created by `init`.

### 4. Remove a bad entry

```bash
dont-repeat list
dont-repeat forget <id-prefix>    # e.g. dont-repeat forget mrksod44
```

---

## Command reference

| Command | What it does | When to use |
|---------|----------------|-------------|
| `dont-repeat guide` | Beginner walkthrough | First time / lost |
| `dont-repeat --help` | All commands + examples | Anytime |
| `dont-repeat help <cmd>` | Help for one command | e.g. `help log` |
| `init` | Set up project memory | Once per repo |
| `log <type> <summary>` | Save a lesson | After a failure or decision |
| `list` | Show memories | Review what agents see |
| `search <query>` | Find a memory | Look up a topic |
| `forget <id>` | Soft-delete a memory | Wrong / outdated entry |
| `status` | Counts + token size | Quick health glance |
| `doctor` | Full setup check | After init or upgrades |
| `render` | Rebuild `MEMORY.md` | After manual store edits |
| `budget <n>` | Max tokens for MEMORY.md | If you need more room |
| `distill [file]` | Extract lessons from notes | End of a messy session |
| `mcp` | MCP server for agents | Tool-based log/search |
| `path` | Print file paths | Debugging |

### Memory types for `log`

```
failure | do_not | decision | gotcha | command | fact
```

### Tips that work well

- Prefer **short one-liners** (agents load a small budget, default ~600 tokens).  
- Prefer **`failure` / `do_not`** — that’s where the product shines.  
- Run `dont-repeat doctor` if something feels off.

---

## How it works

```text
your-project/
├── .agent-memory/
│   ├── store.json     ← source of truth (structured entries)
│   └── MEMORY.md      ← compact file agents actually read
├── CLAUDE.md          ← “please read MEMORY.md” (Claude Code)
├── AGENTS.md          ← same for Codex / OpenCode / Cursor
└── GEMINI.md          ← same for Gemini CLI
```

1. You **log** (or distill / MCP-add) structured memories  
2. dont-repeat **ranks** them (failures first) under a token budget  
3. Agents **load** `MEMORY.md` through their normal instruction files  

You do **not** need to paste memory into the chat every time.

---

## Supported agents

| Tool | How it loads memory | Extra automation |
|------|---------------------|------------------|
| **Claude Code** | `CLAUDE.md` | SessionStart + PreCompact hooks |
| **Codex CLI** | `AGENTS.md` | Load on session start |
| **Gemini CLI** | `GEMINI.md` | Load on session start |
| **OpenCode** | `AGENTS.md` (+ `opencode.json` if present) | Load |
| **Cursor** | `AGENTS.md` + `.cursor/rules/dont-repeat.mdc` | Load |
| **Other tools** | Point them at `.agent-memory/MEMORY.md` | Manual |

```bash
dont-repeat init --agents all
dont-repeat init --agents claude
```

---

## Distill notes into memory

Turn messy session notes into structured entries (**no API key**).

```bash
# preview only
dont-repeat distill notes.txt

# save into the store
dont-repeat distill notes.txt --apply

# pipe text
echo "FAILURE: never commit .env" | dont-repeat distill --apply
```

For best results, tag lines:

```text
FAILURE: do not use jest for e2e — use playwright
DECISION: auth lives in src/lib/session.ts
GOTCHA: refresh tokens expire after 7 days in staging
COMMAND: pnpm test:unit
```

Example file in this repo: [`examples/session-notes.txt`](./examples/session-notes.txt)

---

## MCP (optional)

Let agents call memory as tools:

```bash
dont-repeat mcp
```

Example config:

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

| Tool | Purpose |
|------|---------|
| `memory_log` | Add a memory |
| `memory_search` | Search |
| `memory_list` | List |
| `memory_status` | Health / tokens |
| `memory_render` | Rebuild MEMORY.md |

---

## Privacy

- **100% local** — no cloud, no telemetry, no account  
- `.agent-memory/` is **gitignored by default**  
- Only you decide if any memory is shared with a team  

---

## FAQ

**Do I need an API key?**  
No. Core features (init, log, distill rules, doctor, mcp) run offline.

**Will this make my context huge?**  
No. `MEMORY.md` is capped (default **~600 tokens**). Failures win over low-value facts. Change with `dont-repeat budget 800`.

**What if I already have a CLAUDE.md / AGENTS.md?**  
`init` only inserts a managed block between markers. It does not wipe your file.

**How do I uninstall from a project?**  
Delete `.agent-memory/` and remove the `<!-- dont-repeat:start -->…<!-- dont-repeat:end -->` blocks from instruction files (or leave them; they’re harmless).

**Is the name taken by other “DRY” libraries?**  
Unrelated. This project is specifically **agent session memory**.

---

## Demo (developers)

```bash
git clone https://github.com/xCaptaiN09/dont-repeat.git
cd dont-repeat && npm install && npm run build && npm link
bash scripts/demo.sh
```

---

## Roadmap

- [x] Local store + token-budgeted `MEMORY.md`  
- [x] Multi-agent init  
- [x] Claude Code hooks  
- [x] Distill / doctor / MCP  
- [x] Rich `--help` + `guide`  
- [ ] Optional LLM-assisted distill  
- [ ] Opt-in shared team memory  

---

## Credits

Built by **[Muhammed Dilshad A](https://github.com/xCaptaiN09)** — [@xCaptaiN09](https://github.com/xCaptaiN09)

If this saves you a wasted agent session, a star on GitHub helps others find it.

**Links**

- npm: https://www.npmjs.com/package/dont-repeat  
- GitHub: https://github.com/xCaptaiN09/dont-repeat  

---

## License

[MIT](./LICENSE) © 2026 Muhammed Dilshad A (xCaptaiN09)
