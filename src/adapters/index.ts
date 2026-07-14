import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { memoryPath } from "../core/paths.js";
import type { AgentId } from "../core/types.js";
import { joinProject, upsertManagedSection } from "./managed.js";

export interface AdapterResult {
  agent: AgentId;
  files: string[];
  notes: string[];
}

export const ALL_AGENTS: AgentId[] = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "cursor",
  "generic",
];

export function parseAgents(raw?: string): AgentId[] {
  if (!raw || raw.trim() === "" || raw.trim() === "all") {
    return [...ALL_AGENTS];
  }
  const parts = raw.split(",").map((s) => s.trim().toLowerCase());
  const out: AgentId[] = [];
  for (const p of parts) {
    if (!ALL_AGENTS.includes(p as AgentId)) {
      throw new Error(
        `Unknown agent "${p}". Valid: ${ALL_AGENTS.join(", ")}, or "all"`,
      );
    }
    if (!out.includes(p as AgentId)) out.push(p as AgentId);
  }
  return out;
}

export function installAdapters(
  projectRoot: string,
  agents: AgentId[],
): AdapterResult[] {
  const mem = memoryPath(projectRoot);
  const results: AdapterResult[] = [];

  for (const agent of agents) {
    switch (agent) {
      case "claude":
        results.push(installClaude(projectRoot, mem));
        break;
      case "codex":
        results.push(installInstructionFile(projectRoot, mem, "codex", "AGENTS.md"));
        break;
      case "gemini":
        results.push(installInstructionFile(projectRoot, mem, "gemini", "GEMINI.md"));
        break;
      case "opencode":
        results.push(installOpenCode(projectRoot, mem));
        break;
      case "cursor":
        results.push(installCursor(projectRoot, mem));
        break;
      case "generic":
        results.push({
          agent: "generic",
          files: [mem],
          notes: [
            "Generic mode: agents should read .agent-memory/MEMORY.md",
            "Point any tool at that file, or add a one-line instruction in your rules.",
          ],
        });
        break;
    }
  }
  return results;
}

function installInstructionFile(
  projectRoot: string,
  mem: string,
  agent: AgentId,
  filename: string,
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
    ],
  };
}

function installClaude(projectRoot: string, mem: string): AdapterResult {
  const files: string[] = [];
  const notes: string[] = [];

  const claudeMd = joinProject(projectRoot, "CLAUDE.md");
  const r = upsertManagedSection(claudeMd, mem, projectRoot);
  files.push(r.path);
  notes.push(
    r.created
      ? "Created CLAUDE.md with dont-repeat pointer"
      : r.updated
        ? "Updated managed section in CLAUDE.md"
        : "CLAUDE.md already up to date",
  );

  const hooksDir = joinProject(projectRoot, ".claude", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  const sessionStart = join(hooksDir, "dont-repeat-session-start.sh");
  writeFileSync(
    sessionStart,
    `#!/usr/bin/env bash
# dont-repeat — SessionStart: ensure MEMORY.md is fresh
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
# dont-repeat — Stop hook placeholder (non-blocking)
# Future: auto-distill from transcript when distill lands.
exit 0
`,
    { mode: 0o755 },
  );
  files.push(stopHook);

  const settingsPath = joinProject(projectRoot, ".claude", "settings.json");
  try {
    mergeClaudeHooks(settingsPath);
    files.push(settingsPath);
    notes.push(
      "Installed Claude Code hooks (SessionStart + Stop) in .claude/settings.json",
    );
  } catch (e) {
    notes.push(
      `Could not auto-edit .claude/settings.json (${String(e)}). Hook scripts are under .claude/hooks/`,
    );
  }

  notes.push(
    "Claude Code: MEMORY.md pointer is in CLAUDE.md; SessionStart re-renders memory.",
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

  hooks.SessionStart = ensureHookGroup(hooks.SessionStart, sessionCmd);
  hooks.Stop = ensureHookGroup(hooks.Stop, stopCmd);
  settings.hooks = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

function ensureHookGroup(existing: unknown, command: string): unknown[] {
  const groups = Array.isArray(existing) ? [...existing] : [];
  if (JSON.stringify(groups).includes("dont-repeat")) return groups;
  groups.push({
    hooks: [{ type: "command", command }],
  });
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
      ? "Created AGENTS.md for OpenCode/Codex-style agents"
      : r.updated
        ? "Updated managed section in AGENTS.md"
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
        notes.push("Added .agent-memory/MEMORY.md to opencode.json instructions");
      } else {
        notes.push("opencode.json already lists MEMORY.md");
      }
    } catch {
      notes.push("Found opencode.json but could not parse it — left unchanged");
    }
  } else {
    notes.push(
      "No opencode.json yet — AGENTS.md pointer is enough for OpenCode",
    );
  }

  return { agent: "opencode", files, notes };
}

function installCursor(projectRoot: string, mem: string): AdapterResult {
  const files: string[] = [];
  const notes: string[] = [];

  const agents = joinProject(projectRoot, "AGENTS.md");
  const r = upsertManagedSection(agents, mem, projectRoot);
  files.push(r.path);

  const rulesDir = joinProject(projectRoot, ".cursor", "rules");
  mkdirSync(rulesDir, { recursive: true });
  const rulePath = join(rulesDir, "dont-repeat.mdc");
  writeFileSync(
    rulePath,
    `---
description: Project memory from dont-repeat — failures, decisions, commands
globs:
alwaysApply: true
---

# dont-repeat project memory

Read and respect \`.agent-memory/MEMORY.md\` before non-trivial work.

- Do not re-attempt **failure** / **do_not** items.
- Prefer listed **command** recipes.
- Honor **decision** entries unless the user overrides.
`,
    "utf8",
  );
  files.push(rulePath);
  notes.push(
    "Installed Cursor rule .cursor/rules/dont-repeat.mdc + AGENTS.md pointer",
  );
  return { agent: "cursor", files, notes };
}
