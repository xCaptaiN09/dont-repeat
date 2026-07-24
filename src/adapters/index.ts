import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { memoryPath, storeDir } from "../core/paths.js";
import type { AgentId } from "../core/types.js";
import { HOWTO_FILE } from "../core/types.js";
import {
  alwaysOnRuleBody,
  joinProject,
  upsertManagedSection,
} from "./managed.js";

function writeMcpConfig(projectRoot: string, filePath: string, notes: string[]): void {
  const absPath = joinProject(projectRoot, filePath);
  let config: Record<string, unknown> = {};
  if (existsSync(absPath)) {
    try {
      config = JSON.parse(readFileSync(absPath, "utf8")) as Record<string, unknown>;
    } catch {}
  }
  const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
  servers["dont-repeat"] = { command: "dont-repeat", args: ["mcp"] };
  config.mcpServers = servers;
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  notes.push(`Wrote MCP config to ${filePath}`);
}


export interface AdapterResult {
  agent: AgentId;
  files: string[];
  notes: string[];
}

/** All first-class adapters (order is stable for status output). */
export const ALL_AGENTS: AgentId[] = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "cursor",
  "agy",
  "hermes",
  "kimi",
  "qwen",
  "openclaw",
  "zcode",
  "aider",
  "windsurf",
  "copilot",
  "generic",
];

/** User-friendly aliases → canonical AgentId */
const ALIASES: Record<string, AgentId> = {
  claude: "claude",
  "claude-code": "claude",
  claudecode: "claude",
  codex: "codex",
  "openai-codex": "codex",
  gemini: "gemini",
  "gemini-cli": "gemini",
  opencode: "opencode",
  "open-code": "opencode",
  cursor: "cursor",
  agy: "agy",
  antigravity: "agy",
  "antigravity-cli": "agy",
  hermes: "hermes",
  "hermes-agent": "hermes",
  kimi: "kimi",
  "kimi-cli": "kimi",
  moonshot: "kimi",
  qwen: "qwen",
  "qwen-code": "qwen",
  "qwen-cli": "qwen",
  openclaw: "openclaw",
  claw: "openclaw",
  zcode: "zcode",
  "z-code": "zcode",
  aider: "aider",
  windsurf: "windsurf",
  cascade: "windsurf",
  copilot: "copilot",
  "github-copilot": "copilot",
  generic: "generic",
  any: "generic",
  other: "generic",
};

export function parseAgents(raw?: string): AgentId[] {
  if (!raw || raw.trim() === "" || raw.trim() === "all") {
    return [...ALL_AGENTS];
  }
  const parts = raw.split(",").map((s) => s.trim().toLowerCase());
  const out: AgentId[] = [];
  for (const p of parts) {
    const id = ALIASES[p];
    if (!id) {
      throw new Error(
        `Unknown agent "${p}". Valid: ${ALL_AGENTS.join(", ")}, or "all". ` +
          `Aliases: antigravity→agy, claude-code→claude, hermes-agent→hermes, …`,
      );
    }
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function installAdapters(
  projectRoot: string,
  agents: AgentId[],
): AdapterResult[] {
  const mem = memoryPath(projectRoot);
  const results: AdapterResult[] = [];

  // Always drop a connect guide so unsupported tools are never a dead end
  const howtoPath = writeHowToConnectFile(projectRoot);

  for (const agent of agents) {
    switch (agent) {
      case "claude":
        results.push(installClaude(projectRoot, mem));
        break;
      case "codex":
        results.push(
          installInstructionFile(projectRoot, mem, "codex", "AGENTS.md", [
            "Codex CLI auto-reads AGENTS.md at project root.",
          ]),
        );
        break;
      case "gemini":
        results.push(
          installInstructionFile(projectRoot, mem, "gemini", "GEMINI.md", [
            "Gemini CLI auto-reads GEMINI.md.",
          ]),
        );
        break;
      case "opencode":
        results.push(installOpenCode(projectRoot, mem));
        break;
      case "cursor":
        results.push(installCursor(projectRoot, mem));
        break;
      case "agy":
        results.push(installAgy(projectRoot, mem));
        break;
      case "hermes":
        results.push(installHermes(projectRoot, mem));
        break;
      case "kimi":
        results.push(installKimi(projectRoot, mem));
        break;
      case "qwen":
        results.push(installQwen(projectRoot, mem));
        break;
      case "openclaw":
        results.push(installOpenClaw(projectRoot, mem));
        break;
      case "zcode":
        results.push(installZCode(projectRoot, mem));
        break;
      case "aider":
        results.push(installAider(projectRoot, mem));
        break;
      case "windsurf":
        results.push(installWindsurf(projectRoot, mem));
        break;
      case "copilot":
        results.push(installCopilot(projectRoot, mem));
        break;
      case "generic":
        results.push({
          agent: "generic",
          files: [mem, howtoPath],
          notes: [
            "Generic fallback enabled for ANY tool.",
            "Point your agent at: .agent-memory/MEMORY.md",
            "Or add: Read .agent-memory/MEMORY.md before non-trivial work.",
            `See: ${HOWTO_FILE}`,
            "Optional: dont-repeat mcp  (memory_log / memory_search tools)",
          ],
        });
        break;
    }
  }

  // Surface the connect guide once at the end (not as a fake agent)
  if (!agents.includes("generic")) {
    results.push({
      agent: "generic",
      files: [howtoPath],
      notes: [
        `Also wrote .agent-memory/${HOWTO_FILE}`,
        "Any CLI not listed above can still use MEMORY.md — open that guide.",
      ],
    });
  }

  return results;
}

function writeHowToConnectFile(projectRoot: string): string {
  mkdirSync(storeDir(projectRoot), { recursive: true });
  const path = join(storeDir(projectRoot), HOWTO_FILE);
  writeFileSync(path, howToConnectMarkdown(), "utf8");
  return path;
}

function howToConnectMarkdown(): string {
  return `# How to connect any coding agent to dont-repeat

## Set and forget

After \`dont-repeat init\`, you should **not** need to type every failure.

1. Agents **read** \`.agent-memory/MEMORY.md\` every session  
2. Agents are **ordered** to self-log failures (MCP \`memory_log\` or \`dont-repeat log\`)  
3. Claude Code also has **hooks** that auto-log failed tools and distill on stop  

Switch models anytime (Opus → Codex → agy): memory is **per project**, shared by all.

## Universal file

\`\`\`text
.agent-memory/MEMORY.md
\`\`\`

## If your CLI has no native adapter

### 1) One-line rule

\`\`\`text
Read .agent-memory/MEMORY.md first. On any failure, run:
dont-repeat log failure "what failed — do not retry" 
(or call memory_log MCP). Do not ask the user to log.
\`\`\`

### 2) @-mention MEMORY.md at session start

### 3) MCP

\`\`\`json
{
  "mcpServers": {
    "dont-repeat": {
      "command": "dont-repeat",
      "args": ["mcp"]
    }
  }
}
\`\`\`

## Manual log (optional backup only)

\`\`\`bash
dont-repeat log failure "only if the agent forgot"
dont-repeat status
\`\`\`

## Help

\`\`\`bash
dont-repeat guide
dont-repeat --help
\`\`\`
`;
}

function installInstructionFile(
  projectRoot: string,
  mem: string,
  agent: AgentId,
  filename: string,
  extraNotes: string[] = [],
): AdapterResult {
  const path = joinProject(projectRoot, filename);
  const r = upsertManagedSection(path, mem, projectRoot);
  return {
    agent,
    files: [r.path],
    notes: [
      r.created
        ? `Created ${filename} with dont-repeat pointer`
        : r.updated
          ? `Updated managed section in ${filename}`
          : `${filename} already up to date`,
      ...extraNotes,
    ],
  };
}

function installMulti(
  projectRoot: string,
  mem: string,
  agent: AgentId,
  files: string[],
  notes: string[],
): AdapterResult {
  const outFiles: string[] = [];
  const outNotes = [...notes];
  for (const filename of files) {
    const path = joinProject(projectRoot, filename);
    const r = upsertManagedSection(path, mem, projectRoot);
    outFiles.push(r.path);
    outNotes.push(
      r.created
        ? `Created ${filename}`
        : r.updated
          ? `Updated ${filename}`
          : `${filename} ok`,
    );
  }
  return { agent, files: outFiles, notes: outNotes };
}

function installClaude(projectRoot: string, mem: string): AdapterResult {
  const files: string[] = [];
  const notes: string[] = [];

  const claudeMd = joinProject(projectRoot, "CLAUDE.md");
  const r = upsertManagedSection(claudeMd, mem, projectRoot);
  files.push(r.path);
  notes.push(
    r.created
      ? "Created CLAUDE.md with auto self-log rules"
      : r.updated
        ? "Updated CLAUDE.md managed section"
        : "CLAUDE.md already up to date",
  );

  // Always-on rule file (Claude Code loads .claude/rules/*.md)
  const rulesDir = joinProject(projectRoot, ".claude", "rules");
  mkdirSync(rulesDir, { recursive: true });
  const rulePath = join(rulesDir, "dont-repeat.md");
  writeFileSync(rulePath, alwaysOnRuleBody(), "utf8");
  files.push(rulePath);

  writeMcpConfig(projectRoot, ".mcp.json", notes);
  const hooksDir = joinProject(projectRoot, ".claude", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  const sessionStart = join(hooksDir, "dont-repeat-session-start.sh");
  writeFileSync(
    sessionStart,
    `#!/usr/bin/env bash
# dont-repeat — SessionStart: refresh MEMORY.md
set -euo pipefail
ROOT="\${CLAUDE_PROJECT_DIR:-.}"
if command -v dont-repeat >/dev/null 2>&1; then
  (cd "$ROOT" && dont-repeat render --quiet) || true
fi
exit 0
`,
    { mode: 0o755 },
  );
  files.push(sessionStart);

  const stopHook = join(hooksDir, "dont-repeat-stop.sh");
  writeFileSync(
    stopHook,
    `#!/usr/bin/env bash
# dont-repeat — Stop: distill lessons from last assistant message (best-effort)
set -euo pipefail
ROOT="\${CLAUDE_PROJECT_DIR:-.}"
cd "$ROOT" || exit 0
command -v dont-repeat >/dev/null 2>&1 || exit 0
command -v node >/dev/null 2>&1 || exit 0
node -e '
let d="";
process.stdin.setEncoding("utf8");
process.stdin.on("data", c => d += c);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(d || "{}");
    const msg = String(j.last_assistant_message || "");
    if (msg.length < 40) process.exit(0);
    if (!/fail|error|rejected|cannot |can\\x27t |does not work|broke|exception|E[A-Z]+/i.test(msg)) {
      process.exit(0);
    }
    const { spawnSync } = require("child_process");
    spawnSync("dont-repeat", ["distill", "--apply", "-q", "-n", "5"], {
      input: msg,
      encoding: "utf8",
      stdio: ["pipe", "ignore", "ignore"],
    });
  } catch {}
});
'
exit 0
`,
    { mode: 0o755 },
  );
  files.push(stopHook);

  const postFail = join(hooksDir, "dont-repeat-post-fail.sh");
  writeFileSync(
    postFail,
    `#!/usr/bin/env bash
# dont-repeat — PostToolUseFailure: auto-log failed tools (no user action)
set -euo pipefail
ROOT="\${CLAUDE_PROJECT_DIR:-.}"
cd "$ROOT" || exit 0
command -v dont-repeat >/dev/null 2>&1 || exit 0
command -v node >/dev/null 2>&1 || exit 0
node -e '
let d="";
process.stdin.setEncoding("utf8");
process.stdin.on("data", c => d += c);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(d || "{}");
    const name = String(j.tool_name || "tool");
    const input = j.tool_input || {};
    const cmd = String(input.command || input.file_path || input.path || "").slice(0, 90);
    const err = String(j.error || j.message || j.tool_result || "").slice(0, 80);
    const summary = ("failed " + name + (cmd ? ": " + cmd : "") + (err ? " — " + err : ""))
      .replace(/[\\r\\n]+/g, " ")
      .slice(0, 140);
    if (summary.length < 12) process.exit(0);
    const { spawnSync } = require("child_process");
    spawnSync(
      "dont-repeat",
      ["log", "failure", summary, "-q", "--source", "hook", "-t", "auto,hook"],
      { stdio: "ignore" },
    );
  } catch {}
});
'
exit 0
`,
    { mode: 0o755 },
  );
  files.push(postFail);

  const preCompact = join(hooksDir, "dont-repeat-precompact.sh");
  writeFileSync(
    preCompact,
    `#!/usr/bin/env bash
# dont-repeat — PreCompact: re-render MEMORY.md so lessons survive
set -euo pipefail
ROOT="\${CLAUDE_PROJECT_DIR:-.}"
if command -v dont-repeat >/dev/null 2>&1; then
  (cd "$ROOT" && dont-repeat render --quiet) || true
fi
if [ -f "$ROOT/.agent-memory/MEMORY.md" ]; then
  echo "dont-repeat: re-read .agent-memory/MEMORY.md after compact."
fi
exit 0
`,
    { mode: 0o755 },
  );
  files.push(preCompact);

  const settingsPath = joinProject(projectRoot, ".claude", "settings.json");
  try {
    mergeClaudeHooks(settingsPath);
    files.push(settingsPath);
    notes.push(
      "Claude hooks: SessionStart, Stop(distill), PostToolUseFailure(auto-log), PreCompact",
    );
  } catch (e) {
    notes.push(
      `Could not auto-edit .claude/settings.json (${String(e)}). Hooks under .claude/hooks/`,
    );
  }

  notes.push(
    "Claude Code: automatic — MCP + self-log rules + failure hooks. User does not need to log.",
  );
  return { agent: "claude", files, notes };
}

function mergeClaudeHooks(settingsPath: string): void {
  mkdirSync(dirname(settingsPath), { recursive: true });
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<
      string,
      unknown
    >;
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
  const sessionCmd =
    'bash "${CLAUDE_PROJECT_DIR}/.claude/hooks/dont-repeat-session-start.sh"';
  const stopCmd =
    'bash "${CLAUDE_PROJECT_DIR}/.claude/hooks/dont-repeat-stop.sh"';
  const preCompactCmd =
    'bash "${CLAUDE_PROJECT_DIR}/.claude/hooks/dont-repeat-precompact.sh"';
  const postFailCmd =
    'bash "${CLAUDE_PROJECT_DIR}/.claude/hooks/dont-repeat-post-fail.sh"';

  hooks.SessionStart = ensureHookGroup(hooks.SessionStart, sessionCmd);
  hooks.Stop = ensureHookGroup(hooks.Stop, stopCmd);
  hooks.PreCompact = ensureHookGroup(hooks.PreCompact, preCompactCmd);
  hooks.PostToolUseFailure = ensureHookGroup(
    hooks.PostToolUseFailure,
    postFailCmd,
    "*",
  );
  settings.hooks = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

function ensureHookGroup(
  existing: unknown,
  command: string,
  matcher?: string,
): unknown[] {
  const groups = Array.isArray(existing) ? [...existing] : [];
  const marker =
    command.match(/dont-repeat-[a-z0-9-]+\.sh/)?.[0] ?? "dont-repeat";
  if (JSON.stringify(groups).includes(marker)) return groups;
  const group: Record<string, unknown> = {
    hooks: [{ type: "command", command }],
  };
  if (matcher) group.matcher = matcher;
  groups.push(group);
  return groups;
}

function installOpenCode(projectRoot: string, mem: string): AdapterResult {
  const files: string[] = [];
  const notes: string[] = [];

  const agents = joinProject(projectRoot, "AGENTS.md");
  const r = upsertManagedSection(agents, mem, projectRoot);
  files.push(r.path);
  notes.push(
    r.created
      ? "Created AGENTS.md for OpenCode"
      : r.updated
        ? "Updated AGENTS.md"
        : "AGENTS.md already up to date",
  );

  const ocPath = joinProject(projectRoot, "opencode.json");
  if (existsSync(ocPath)) {
    try {
      const json = JSON.parse(readFileSync(ocPath, "utf8")) as {
        instructions?: string[];
      };
      const rel = ".agent-memory/MEMORY.md";
      const list = json.instructions ?? [];
      if (!list.includes(rel)) {
        json.instructions = [...list, rel];
        writeFileSync(ocPath, JSON.stringify(json, null, 2) + "\n", "utf8");
        files.push(ocPath);
        notes.push("Added MEMORY.md to opencode.json instructions");
      } else {
        notes.push("opencode.json already lists MEMORY.md");
      }
    } catch {
      notes.push("Found opencode.json but could not parse — left unchanged");
    }
  } else {
    notes.push("No opencode.json yet — AGENTS.md is enough for OpenCode");
  }

  return { agent: "opencode", files, notes };
}

function installCursor(projectRoot: string, mem: string): AdapterResult {
  const files: string[] = [];
  const notes: string[] = [];

  const agents = joinProject(projectRoot, "AGENTS.md");
  const r = upsertManagedSection(agents, mem, projectRoot);
  files.push(r.path);

  writeMcpConfig(projectRoot, ".cursor/mcp.json", notes);
  const rulesDir = joinProject(projectRoot, ".cursor", "rules");
  mkdirSync(rulesDir, { recursive: true });
  const rulePath = join(rulesDir, "dont-repeat.mdc");
  writeFileSync(
    rulePath,
    `---
description: dont-repeat automatic project memory — read MEMORY.md and self-log failures
globs:
alwaysApply: true
---

${alwaysOnRuleBody()}
`,
    "utf8",
  );
  files.push(rulePath);
  notes.push(
    "Cursor: MCP + always-on rule with automatic self-logging instructions",
  );
  return { agent: "cursor", files, notes };
}

function installAgy(projectRoot: string, mem: string): AdapterResult {
  return installMulti(projectRoot, mem, "agy", ["AGENTS.md", "GEMINI.md"], [
    "Antigravity CLI (agy) reads AGENTS.md and/or GEMINI.md.",
    "Alias: --agents antigravity",
  ]);
}

function installHermes(projectRoot: string, mem: string): AdapterResult {
  return installMulti(projectRoot, mem, "hermes", ["AGENTS.md", "HERMES.md"], [
    "Hermes checks HERMES.md / AGENTS.md / CLAUDE.md (first match wins).",
    "We write HERMES.md + AGENTS.md so Hermes and other tools both benefit.",
  ]);
}

function installKimi(projectRoot: string, mem: string): AdapterResult {
  return installMulti(projectRoot, mem, "kimi", ["AGENTS.md", "KIMI.md"], [
    "Kimi CLI: AGENTS.md + KIMI.md pointer. Also try MCP: dont-repeat mcp",
  ]);
}

function installQwen(projectRoot: string, mem: string): AdapterResult {
  return installMulti(projectRoot, mem, "qwen", ["AGENTS.md", "QWEN.md"], [
    "Qwen Code / Qwen CLI: AGENTS.md + QWEN.md pointer.",
  ]);
}

function installOpenClaw(projectRoot: string, mem: string): AdapterResult {
  return installMulti(projectRoot, mem, "openclaw", ["AGENTS.md", "CLAW.md"], [
    "OpenClaw: CLAW.md + AGENTS.md pointers.",
    "If OpenClaw ignores those, use MCP or @-mention MEMORY.md (see HOW_TO_CONNECT.md).",
  ]);
}

function installZCode(projectRoot: string, mem: string): AdapterResult {
  return installMulti(projectRoot, mem, "zcode", ["AGENTS.md"], [
    "ZCode (desktop): AGENTS.md pointer for tools that honor it.",
    "If ZCode only uses chat context, @-attach .agent-memory/MEMORY.md each session.",
  ]);
}

function installAider(projectRoot: string, mem: string): AdapterResult {
  const files: string[] = [];
  const notes: string[] = [];
  const conventions = joinProject(projectRoot, "CONVENTIONS.md");
  const r = upsertManagedSection(conventions, mem, projectRoot);
  files.push(r.path);
  const agents = joinProject(projectRoot, "AGENTS.md");
  const r2 = upsertManagedSection(agents, mem, projectRoot);
  files.push(r2.path);
  notes.push(
    "Aider: CONVENTIONS.md + AGENTS.md. Tip: aider --read .agent-memory/MEMORY.md",
  );
  return { agent: "aider", files, notes };
}

function installWindsurf(projectRoot: string, mem: string): AdapterResult {
  const files: string[] = [];
  const notes: string[] = [];
  const agents = joinProject(projectRoot, "AGENTS.md");
  const r = upsertManagedSection(agents, mem, projectRoot);
  files.push(r.path);

  const wind = joinProject(projectRoot, ".windsurfrules");
  const r2 = upsertManagedSection(wind, mem, projectRoot);
  files.push(r2.path);
  notes.push("Windsurf: AGENTS.md + .windsurfrules");
  return { agent: "windsurf", files, notes };
}

function installCopilot(projectRoot: string, mem: string): AdapterResult {
  return installMulti(projectRoot, mem, "copilot", ["AGENTS.md"], [
    "GitHub Copilot coding agent often honors AGENTS.md in-repo.",
    "For IDE chat, @-mention .agent-memory/MEMORY.md if needed.",
  ]);
}
