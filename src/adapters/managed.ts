import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { mkdirSync } from "node:fs";
import { MANAGED_END, MANAGED_START } from "../core/types.js";

export function managedBlock(memoryRelPath: string): string {
  return [
    MANAGED_START,
    "## Project memory (dont-repeat)",
    "",
    "Before non-trivial changes, read and respect:",
    "",
    "`${memoryRelPath}`",
    "",
    "- Do **not** re-attempt items marked as **failure** or **do_not**.",
    "- Prefer listed **command** recipes and honor **decision** entries.",
    "- **AUTOMATIC SELF-LOGGING (CRITICAL RULE):** If you attempt a fix, run a command, or write code that FAILS or gets rejected, you MUST log it yourself immediately before trying a different approach. Use the memory_log tool if available, or run dont-repeat log failure in the terminal. Do NOT ask the user for permission. You are strictly forbidden from repeating logged failures.",
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
  const rel = relative(projectRoot, memoryAbsPath).split("\\").join("/") || memoryAbsPath;
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
