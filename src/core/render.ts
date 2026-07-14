import { estimateTokens } from "./tokens.js";
import { formatLine } from "./ranker.js";
import type { MemoryEntry, StoreMeta } from "./types.js";

const TYPE_ORDER = [
  "failure",
  "do_not",
  "decision",
  "gotcha",
  "command",
  "fact",
] as const;

/**
 * Render the inject file agents will read.
 * Kept short on purpose — this is the whole product.
 */
export function renderMemoryMarkdown(
  entries: MemoryEntry[],
  meta: StoreMeta,
): string {
  const lines: string[] = [
    "# Project memory (dont-repeat)",
    "",
    "> Auto-generated. Do **not** re-attempt listed **failure** / **do_not** items.",
    "> Prefer listed **command** recipes. Respect **decision** choices unless the user overrides.",
    ">",
    `> Budget ~${meta.tokenBudget} tokens · active entries shown: ${entries.length}`,
    `> Updated: ${meta.updatedAt}`,
    "",
  ];

  if (entries.length === 0) {
    lines.push("_No active memories yet. Add some with `dont-repeat log`._", "");
    return lines.join("\n");
  }

  const byType = new Map<string, MemoryEntry[]>();
  for (const e of entries) {
    const list = byType.get(e.type) ?? [];
    list.push(e);
    byType.set(e.type, list);
  }

  for (const type of TYPE_ORDER) {
    const group = byType.get(type);
    if (!group?.length) continue;
    lines.push(`## ${labelFor(type)}`, "");
    for (const e of group) {
      lines.push(formatLine(e));
    }
    lines.push("");
  }

  const body = lines.join("\n");
  const tokens = estimateTokens(body);
  lines.push(`<!-- approx_tokens: ${tokens} -->`, "");
  return lines.join("\n");
}

function labelFor(type: string): string {
  switch (type) {
    case "failure":
      return "Failures (do not retry blindly)";
    case "do_not":
      return "Do not";
    case "decision":
      return "Decisions";
    case "gotcha":
      return "Gotchas";
    case "command":
      return "Working commands";
    case "fact":
      return "Facts";
    default:
      return type;
  }
}
