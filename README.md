# dont-repeat

### Stop AI coding agents from making the same mistake twice.

**Set up once. Work normally. Agents learn.**

You should **not** type every failure by hand. After `init`, agents are instructed to **self-log** mistakes, and Claude Code also gets **hooks** that capture failed tools automatically.

Memory is **per project** — switch from Claude Opus → Codex → agy anytime; they all share the same lessons.

[![npm version](https://img.shields.io/npm/v/dont-repeat)](https://www.npmjs.com/package/dont-repeat)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

---

## 60-second setup

```bash
npm install -g dont-repeat
cd your-project
dont-repeat init
```

That’s it. Open Claude Code, Codex, Cursor, Gemini, OpenCode, agy, Hermes, …

```bash
dont-repeat guide    # beginner walkthrough
dont-repeat doctor   # optional health check
```

No cloud. No account. No API key.

---

## How automatic is it?

| Layer | What happens | You do |
|--------|----------------|--------|
| **Read memory** | Agents load `.agent-memory/MEMORY.md` via instruction files | Nothing |
| **Self-log (all agents)** | Rules say: on failure, call `memory_log` or run `dont-repeat log` | Nothing (agent should) |
| **MCP (Claude / Cursor)** | `init` writes MCP config for silent `memory_log` | Nothing |
| **Claude hooks** | Failed tools → auto-log; stop → best-effort distill | Nothing |
| **Manual log** | Optional backup if a model forgets | Only if you want |

**Honest note:** Auto-log is as strong as we can make it (rules + MCP + hooks). Most agents follow it; a few may skip. Manual `log` remains a backup — not the main path.

**Cross-model:** If Claude logs a failure, Codex in the same repo sees it next session.

---

## What problem this solves

Every new session, agents:

- retry fixes that already failed  
- re-discover the same gotcha  
- burn tokens re-learning your project  

**dont-repeat** keeps a small shared notebook of failures, decisions, and working commands.

---

## Install

**Need:** Node.js 18+

```bash
npm install -g dont-repeat
```

Or: `npx dont-repeat@latest init`

From source:

```bash
git clone https://github.com/xCaptaiN09/dont-repeat.git
cd dont-repeat && npm install && npm run build && npm link
```

---

## Everyday use

### Default (recommended)

1. `dont-repeat init` once  
2. Use your coding agent as usual  
3. Optionally `dont-repeat status` later  

### Optional manual commands

```bash
dont-repeat status
dont-repeat list
dont-repeat search auth
dont-repeat doctor

# only if you want to add a lesson yourself
dont-repeat log failure "do not use jest for e2e — use playwright"
```

### Distill notes (optional)

```bash
dont-repeat distill notes.txt --apply
```

---

## How it works

```text
your-project/
├── .agent-memory/
│   ├── store.json           # database
│   ├── MEMORY.md            # what agents read (~600 tokens budget)
│   └── HOW_TO_CONNECT.md    # any-CLI fallback
├── CLAUDE.md / AGENTS.md / …  # “read memory + self-log”
├── .mcp.json                  # Claude MCP (auto)
└── .cursor/mcp.json           # Cursor MCP (auto)
```

1. Lessons land in the store (agent, hook, or you)  
2. Ranked into `MEMORY.md` under a token budget  
3. Next session / next model reads the same file  

---

## Supported agents

| Agent | Flag | Automatic features |
|-------|------|--------------------|
| **Claude Code** | `claude` | Rules + MCP + hooks (tool-fail auto-log, stop distill) |
| **Cursor** | `cursor` | Rules + MCP |
| **Codex** | `codex` | AGENTS.md self-log rules |
| **Gemini CLI** | `gemini` | GEMINI.md |
| **OpenCode** | `opencode` | AGENTS.md (no forced opencode.json) |
| **Antigravity (`agy`)** | `agy` | AGENTS.md + GEMINI.md |
| **Hermes** | `hermes` | HERMES.md + AGENTS.md |
| **Kimi / Qwen / OpenClaw / ZCode** | `kimi` `qwen` `openclaw` `zcode` | Instruction pointers |
| **Aider / Windsurf / Copilot** | `aider` `windsurf` `copilot` | Rules / AGENTS.md |
| **Anything else** | `generic` | `MEMORY.md` + HOW_TO_CONNECT |

```bash
dont-repeat init --agents all
dont-repeat init --agents claude,codex,agy
dont-repeat init --agents antigravity   # alias → agy
```

**Models (MiMo, MiniMax, …):** use them *inside* a host CLI — memory follows the host.

---

## Unsupported CLI?

Still works:

1. `dont-repeat init`  
2. Point the tool at `.agent-memory/MEMORY.md`  
3. Or add the self-log one-liner from `HOW_TO_CONNECT.md`  
4. Or wire MCP: `dont-repeat mcp`  

---

## Command reference

| Command | Purpose |
|---------|---------|
| `init` | **Main setup** — do this once |
| `guide` | Beginner walkthrough |
| `status` / `doctor` / `list` / `search` | Inspect |
| `log` | Optional manual lesson |
| `distill` | Extract from notes/transcript |
| `mcp` | MCP server |
| `render` / `budget` / `forget` / `path` | Advanced |

```bash
dont-repeat --help
dont-repeat help init
```

---

## Privacy

- Local only — no cloud, no telemetry  
- `.agent-memory/` gitignored by default  

---

## FAQ

**Do I have to log every failure myself?**  
No. That’s the point of v0.6 — agents + Claude hooks handle it. Manual `log` is backup.

**I switched from Opus to Codex — will Codex know?**  
Yes, if the failure was logged into this project’s memory (by agent, hook, or you).

**Is auto-log 100% for every model?**  
As strong as rules + tools + hooks allow. Claude Code is strongest. Others depend on following instructions.

**API key?**  
Not required.

---

## Credits

**[Muhammed Dilshad A](https://github.com/xCaptaiN09)** — [@xCaptaiN09](https://github.com/xCaptaiN09)

- npm: https://www.npmjs.com/package/dont-repeat  
- GitHub: https://github.com/xCaptaiN09/dont-repeat  

## License

[MIT](./LICENSE) © 2026 Muhammed Dilshad A (xCaptaiN09)
