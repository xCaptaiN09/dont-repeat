import { estimateTokens } from "./tokens.js";
import type { MemoryEntry } from "./types.js";
import { TYPE_PRIORITY } from "./types.js";

function entryScore(e: MemoryEntry): number {
  const typeScore = TYPE_PRIORITY[e.type] ?? 0;
  const ageDays =
    (Date.now() - new Date(e.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  // Prefer fresher entries slightly
  const recency = Math.max(0, 20 - ageDays);
  const conf = (e.confidence ?? 0.8) * 10;
  return typeScore + recency + conf;
}

function formatLine(e: MemoryEntry): string {
  const tagStr = e.tags.length ? ` [${e.tags.join(", ")}]` : "";
  const pathStr = e.paths.length ? ` (${e.paths.join(", ")})` : "";
  let line = `- **${e.type}**: ${e.summary}${tagStr}${pathStr}`;
  if (e.detail) line += `\n  - ${e.detail}`;
  return line;
}

/**
 * Pick active entries that fit under tokenBudget (highest priority first).
 */
export function rankEntries(
  entries: MemoryEntry[],
  tokenBudget: number,
): MemoryEntry[] {
  const active = entries.filter((e) => e.status === "active");
  const sorted = [...active].sort((a, b) => entryScore(b) - entryScore(a));

  const headerReserve = 80; // title + instructions
  let used = headerReserve;
  const picked: MemoryEntry[] = [];

  for (const e of sorted) {
    const cost = estimateTokens(formatLine(e));
    if (used + cost > tokenBudget && picked.length > 0) break;
    picked.push(e);
    used += cost;
  }
  return picked;
}

export { formatLine };
