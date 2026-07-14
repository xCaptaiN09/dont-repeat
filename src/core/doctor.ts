import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryPath, storePath } from "./paths.js";
import { listEntries } from "./store.js";
import { estimateTokens } from "./tokens.js";
import type { MemoryStore } from "./types.js";
import { MANAGED_END, MANAGED_START } from "./types.js";

export interface DoctorFinding {
  level: "ok" | "warn" | "error";
  code: string;
  message: string;
}

export function runDoctor(
  projectRoot: string,
  store: MemoryStore,
): DoctorFinding[] {
  const findings: DoctorFinding[] = [];

  if (!existsSync(storePath(projectRoot))) {
    findings.push({
      level: "error",
      code: "no_store",
      message: "Store missing — run dont-repeat init",
    });
    return findings;
  }

  const active = listEntries(store);
  const inactive = store.entries.length - active.length;

  if (active.length === 0) {
    findings.push({
      level: "warn",
      code: "empty",
      message: "No active memories yet. Log a failure or decision to get value.",
    });
  } else {
    findings.push({
      level: "ok",
      code: "entries",
      message: `${active.length} active · ${inactive} expired/superseded`,
    });
  }

  const mem = memoryPath(projectRoot);
  if (!existsSync(mem)) {
    findings.push({
      level: "warn",
      code: "no_memory_md",
      message: "MEMORY.md missing — run: dont-repeat render",
    });
  } else {
    const tokens = estimateTokens(readFileSync(mem, "utf8"));
    const budget = store.meta.tokenBudget;
    if (tokens > budget * 1.15) {
      findings.push({
        level: "warn",
        code: "over_budget",
        message: `MEMORY.md ~${tokens} tokens exceeds budget ${budget}. Run render or raise budget.`,
      });
    } else {
      findings.push({
        level: "ok",
        code: "budget",
        message: `MEMORY.md ~${tokens} tokens (budget ${budget})`,
      });
    }
  }

  // Near-duplicate active summaries
  const summaries = active.map((e) => e.summary.toLowerCase());
  let dups = 0;
  for (let i = 0; i < summaries.length; i++) {
    for (let j = i + 1; j < summaries.length; j++) {
      if (
        summaries[i] === summaries[j] ||
        (summaries[i].length > 20 &&
          summaries[j].includes(summaries[i].slice(0, 40)))
      ) {
        dups++;
      }
    }
  }
  if (dups > 0) {
    findings.push({
      level: "warn",
      code: "duplicates",
      message: `Possible duplicate memories (~${dups} pairs). Consider forget/supersede.`,
    });
  }

  // Adapter instruction files
  const files = [
    ["claude", "CLAUDE.md"],
    ["codex", "AGENTS.md"],
    ["gemini", "GEMINI.md"],
  ] as const;
  for (const [agent, file] of files) {
    if (!store.meta.agents.includes(agent) && agent !== "codex") continue;
    // always check common files if present
    const path = join(projectRoot, file);
    if (!existsSync(path)) {
      if (store.meta.agents.includes(agent)) {
        findings.push({
          level: "warn",
          code: `missing_${agent}`,
          message: `${file} missing for agent ${agent} — run: dont-repeat init --force`,
        });
      }
      continue;
    }
    const body = readFileSync(path, "utf8");
    if (!body.includes(MANAGED_START) || !body.includes(MANAGED_END)) {
      findings.push({
        level: "warn",
        code: `unmanaged_${file}`,
        message: `${file} has no managed dont-repeat section — run init --force`,
      });
    } else if (!body.includes("MEMORY.md")) {
      findings.push({
        level: "warn",
        code: `stale_${file}`,
        message: `${file} managed block may be stale — run init --force`,
      });
    } else {
      findings.push({
        level: "ok",
        code: `wired_${file}`,
        message: `${file} points at project memory`,
      });
    }
  }

  if (store.meta.agents.includes("claude")) {
    const settings = join(projectRoot, ".claude", "settings.json");
    if (!existsSync(settings)) {
      findings.push({
        level: "warn",
        code: "no_claude_hooks",
        message: "Claude hooks settings missing — run: dont-repeat init --agents claude --force",
      });
    } else {
      const s = readFileSync(settings, "utf8");
      if (!s.includes("dont-repeat")) {
        findings.push({
          level: "warn",
          code: "claude_hooks_unwired",
          message: ".claude/settings.json has no dont-repeat hooks",
        });
      } else {
        findings.push({
          level: "ok",
          code: "claude_hooks",
          message: "Claude Code hooks reference dont-repeat",
        });
      }
    }
  }

  const failures = active.filter((e) => e.type === "failure" || e.type === "do_not");
  if (active.length >= 3 && failures.length === 0) {
    findings.push({
      level: "warn",
      code: "no_failures",
      message:
        "You have memories but no failures/do_not — that's where dont-repeat shines most.",
    });
  }

  return findings;
}
