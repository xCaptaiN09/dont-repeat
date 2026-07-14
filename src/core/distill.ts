import type { LogInput, MemoryType } from "./types.js";

export interface DistillResult {
  candidates: LogInput[];
  skipped: number;
  source: string;
}

/**
 * Rule-based distill — no API key required.
 * Pulls durable lessons from notes or agent transcripts.
 */
export function distillText(raw: string, sourceLabel = "session"): DistillResult {
  const text = normalizeInput(raw);
  const candidates: LogInput[] = [];
  const seen = new Set<string>();

  const add = (type: MemoryType, summary: string, detail?: string, tags?: string[]) => {
    const s = cleanSummary(summary);
    if (!s || s.length < 8 || s.length > 280) return;
    const key = `${type}:${s.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      type,
      summary: s,
      detail: detail ? cleanSummary(detail).slice(0, 400) : undefined,
      tags: tags ?? ["distilled"],
      source: "session",
      confidence: 0.55,
    });
  };

  // Explicit tagged lines: FAILURE: ... / DECISION: ... etc.
  const tagged =
    /^(failure|do_not|do-not|dont|don't|decision|gotcha|command|fact|lesson)\s*[:\-–]\s*(.+)$/gim;
  let m: RegExpExecArray | null;
  while ((m = tagged.exec(text)) !== null) {
    const type = mapTag(m[1]);
    add(type, m[2], undefined, ["distilled", "tagged"]);
  }

  // "do not / don't / never X"
  const dont =
    /(?:^|\n)\s*(?:do not|don't|dont|never)\s+([^\n.!?]{8,160})/gi;
  while ((m = dont.exec(text)) !== null) {
    add("do_not", `do not ${m[1].trim()}`, undefined, ["distilled"]);
  }

  // "use X instead of Y" / "use X, not Y"
  const instead =
    /use\s+([^\n,]{2,80}?)\s+instead of\s+([^\n.!?]{2,80})/gi;
  while ((m = instead.exec(text)) !== null) {
    add(
      "failure",
      `use ${m[1].trim()} instead of ${m[2].trim()}`,
      undefined,
      ["distilled", "instead"],
    );
  }
  const useNot = /use\s+([^\n,]{2,60}?),\s*not\s+([^\n.!?]{2,60})/gi;
  while ((m = useNot.exec(text)) !== null) {
    add(
      "failure",
      `use ${m[1].trim()}, not ${m[2].trim()}`,
      undefined,
      ["distilled"],
    );
  }

  // Failed / error patterns with nearby advice
  const failLine =
    /(?:^|\n)\s*(?:failed|failure|error|broke|breaking)[:\s]+([^\n]{10,200})/gi;
  while ((m = failLine.exec(text)) !== null) {
    const line = m[1].trim();
    if (/stack|trace|errno|ECONN|undefined is not/i.test(line) && line.length > 120) {
      continue; // skip raw stack noise
    }
    add("failure", line, undefined, ["distilled", "error"]);
  }

  // "decided to X" / "we decided X" / "decision: already handled"
  const decided =
    /(?:^|\n)\s*(?:we\s+)?(?:decided|decision is|going with|settled on)\s+([^\n.!?]{8,160})/gi;
  while ((m = decided.exec(text)) !== null) {
    add("decision", m[1].trim(), undefined, ["distilled"]);
  }

  // Working commands: `$ cmd` or "run: cmd" or "working: `cmd`"
  const runCmd =
    /(?:^|\n)\s*(?:run|working command|works|use this)\s*[:\-]\s*`?([a-zA-Z][^\n`]{4,120})`?/gi;
  while ((m = runCmd.exec(text)) !== null) {
    const cmd = m[1].trim();
    if (/^(the|a|an|this|that)\b/i.test(cmd)) continue;
    add("command", cmd, undefined, ["distilled", "command"]);
  }
  const dollar = /(?:^|\n)\s*\$\s+([^\n]{4,120})/g;
  while ((m = dollar.exec(text)) !== null) {
    add("command", m[1].trim(), undefined, ["distilled", "shell"]);
  }

  // Gotcha: "note that" / "gotcha" / "watch out"
  const gotcha =
    /(?:^|\n)\s*(?:gotcha|watch out|note that|important|caveat)\s*[:\-–]?\s*([^\n]{8,160})/gi;
  while ((m = gotcha.exec(text)) !== null) {
    add("gotcha", m[1].trim(), undefined, ["distilled"]);
  }

  return {
    candidates: candidates.slice(0, 40),
    skipped: 0,
    source: sourceLabel,
  };
}

/** Accept plain text, JSON message arrays, or loose JSONL transcripts. */
export function extractTextFromTranscript(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // JSON array of messages
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed) as unknown;
      if (Array.isArray(arr)) {
        return arr
          .map((item) => messageToText(item))
          .filter(Boolean)
          .join("\n");
      }
    } catch {
      /* fall through */
    }
  }

  // Single JSON object with messages / content
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (Array.isArray(obj.messages)) {
        return (obj.messages as unknown[])
          .map((item) => messageToText(item))
          .filter(Boolean)
          .join("\n");
      }
      if (typeof obj.content === "string") return obj.content;
      if (typeof obj.text === "string") return obj.text;
    } catch {
      /* fall through */
    }
  }

  // JSONL
  if (trimmed.includes("\n") && trimmed.split("\n").some((l) => l.trim().startsWith("{"))) {
    const lines: string[] = [];
    for (const line of trimmed.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("{")) {
        lines.push(t);
        continue;
      }
      try {
        lines.push(messageToText(JSON.parse(t)));
      } catch {
        lines.push(t);
      }
    }
    return lines.filter(Boolean).join("\n");
  }

  return raw;
}

function messageToText(item: unknown): string {
  if (item == null) return "";
  if (typeof item === "string") return item;
  if (typeof item !== "object") return String(item);
  const o = item as Record<string, unknown>;
  if (typeof o.content === "string") return o.content;
  if (Array.isArray(o.content)) {
    return o.content
      .map((c) => {
        if (typeof c === "string") return c;
        if (c && typeof c === "object" && "text" in c) {
          return String((c as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("\n");
  }
  if (typeof o.text === "string") return o.text;
  if (typeof o.message === "string") return o.message;
  if (o.message && typeof o.message === "object") {
    return messageToText(o.message);
  }
  return "";
}

function normalizeInput(raw: string): string {
  return extractTextFromTranscript(raw).replace(/\r\n/g, "\n");
}

function cleanSummary(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function mapTag(tag: string): MemoryType {
  const t = tag.toLowerCase().replace(/-/g, "_");
  if (t === "dont" || t === "don't" || t === "do_not") return "do_not";
  if (t === "lesson") return "fact";
  if (
    t === "failure" ||
    t === "decision" ||
    t === "gotcha" ||
    t === "command" ||
    t === "fact"
  ) {
    return t;
  }
  return "fact";
}
