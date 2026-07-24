import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { mkdirSync } from "node:fs";
import { MANAGED_END, MANAGED_START } from "../core/types.js";

/**
 * Instruction block injected into CLAUDE.md / AGENTS.md / etc.
 * Designed so agents self-log failures without the user typing.
 */
export function managedBlock(memoryRelPath: string): string {
  return [
    MANAGED_START,
    "## Project memory (dont-repeat) — AUTOMATIC",
    "",
    "### 1) Always read first",
    `Open and obey \`${memoryRelPath}\` before non-trivial work.`,
    "Do **not** re-attempt items marked **failure** or **do_not**.",
    "Prefer listed **command** recipes. Honor **decision** entries unless the user overrides.",
    "",
    "### 2) AUTOMATIC SELF-LOGGING (CRITICAL — non-negotiable)",
    "The human will **not** log for you. You own this.",
    "",
    "Whenever something FAILS (command error, test fail, rejected approach, wrong path,",
    "build break, permission denied, or the user rejects your change), you MUST log it",
    "**before** trying another approach:",
    "",
    "**Preferred (if MCP tool `memory_log` / `mcp__dont-repeat__memory_log` exists):**",
    "call it silently with `type: \"failure\"` and a short one-line summary of what not to retry.",
    "",
    "**Otherwise run this in the terminal yourself (no asking the user):**",
    "```bash",
    'dont-repeat log failure "SHORT: what failed and what not to retry"',
    "```",
    "",
    "Also log durable **decision** / **command** / **gotcha** when you discover them:",
    "```bash",
    'dont-repeat log decision "we chose X because Y"',
    'dont-repeat log command "working recipe here"',
    "```",
    "",
    "Rules:",
    "- Do **not** ask permission to log.",
    "- Do **not** skip logging because you are busy fixing.",
    "- Do **not** repeat a logged failure.",
    "- Keep summaries under ~120 characters, concrete, reusable next session.",
    "- Cross-model: memory is project-local — Codex/Claude/agy all share the same file.",
    "",
    MANAGED_END,
  ].join("\n");
}

/**
 * Insert or replace the managed dont-repeat section in an instruction file.
 * Creates the file if missing.
 */
export function upsertManagedSection(
  filePath: string,
  memoryAbsPath: string,
  projectRoot: string,
): { created: boolean; updated: boolean; path: string } {
  mkdirSync(dirname(filePath), { recursive: true });
  const rel =
    relative(projectRoot, memoryAbsPath).split("\\").join("/") || memoryAbsPath;
  const block = managedBlock(rel);

  if (!existsSync(filePath)) {
    const body =
      `# Agent instructions\n\n` +
      `<!-- Managed section maintained by dont-repeat. Edit outside the markers freely. -->\n\n` +
      block +
      "\n";
    writeFileSync(filePath, body, "utf8");
    return { created: true, updated: true, path: filePath };
  }

  const existing = readFileSync(filePath, "utf8");
  const start = existing.indexOf(MANAGED_START);
  const end = existing.indexOf(MANAGED_END);

  if (start !== -1 && end !== -1 && end > start) {
    const next =
      existing.slice(0, start) + block + existing.slice(end + MANAGED_END.length);
    if (next !== existing) {
      writeFileSync(filePath, next, "utf8");
      return { created: false, updated: true, path: filePath };
    }
    return { created: false, updated: false, path: filePath };
  }

  const sep = existing.endsWith("\n") ? "\n" : "\n\n";
  writeFileSync(filePath, existing + sep + block + "\n", "utf8");
  return { created: false, updated: true, path: filePath };
}

export function removeManagedSection(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const existing = readFileSync(filePath, "utf8");
  const start = existing.indexOf(MANAGED_START);
  const end = existing.indexOf(MANAGED_END);
  if (start === -1 || end === -1 || end < start) return false;
  let next = existing.slice(0, start) + existing.slice(end + MANAGED_END.length);
  next = next.replace(/\n{3,}/g, "\n\n");
  writeFileSync(filePath, next, "utf8");
  return true;
}

export function joinProject(projectRoot: string, ...parts: string[]): string {
  return join(projectRoot, ...parts);
}

/** Shared always-on rule text for Cursor / Windsurf style rule files */
export function alwaysOnRuleBody(): string {
  return `# dont-repeat — automatic project memory

## Read first
Before non-trivial work, open and obey \`.agent-memory/MEMORY.md\`.
Never re-attempt **failure** / **do_not** items.

## Self-log every failure (CRITICAL)
You log — the user will not.

1. Prefer MCP tool \`memory_log\` (\`type: failure\`, short summary).
2. Else run: \`dont-repeat log failure "what failed — do not retry X"\`
3. Do not ask permission. Log before the next attempt.

Also log decisions/commands when discovered:
\`dont-repeat log decision "..."\` / \`dont-repeat log command "..."\`

Memory is shared across Claude, Codex, Cursor, and every other agent in this repo.
`;
}
