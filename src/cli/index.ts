#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { dirname as dirnamePath, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installAdapters, parseAgents } from "../adapters/index.js";
import { findProjectRoot, isInitialized, memoryPath, storeDir } from "../core/paths.js";
import {
  addEntry,
  createEmptyStore,
  forgetEntry,
  listEntries,
  loadStore,
  persist,
  updateMeta,
} from "../core/store.js";
import { estimateTokens } from "../core/tokens.js";
import type { MemoryType } from "../core/types.js";
import { DEFAULT_TOKEN_BUDGET, MEMORY_TYPES } from "../core/types.js";
import { rankEntries } from "../core/ranker.js";
import { distillText, extractTextFromTranscript } from "../core/distill.js";
import { runDoctor } from "../core/doctor.js";
import { startMcpServer } from "../mcp/server.js";

function packageVersion(): string {
  try {
    const here = dirnamePath(fileURLToPath(import.meta.url));
    const pkgPath = join(here, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.2.0";
  } catch {
    return "0.2.0";
  }
}

const VERSION = packageVersion();

function rootOpt(cwd?: string): string {
  return findProjectRoot(cwd ?? process.cwd());
}

function fail(msg: string): never {
  console.error(pc.red(`error: ${msg}`));
  process.exit(1);
}

function ok(msg: string): void {
  console.log(pc.green("✓"), msg);
}

function info(msg: string): void {
  console.log(pc.dim(msg));
}

const program = new Command();

const HELP_EXAMPLES = `
${pc.bold("Quick start")}
  $ npm install -g dont-repeat
  $ cd my-project
  $ dont-repeat init
  $ dont-repeat log failure "do not use jest for e2e — use playwright"
  $ dont-repeat status

${pc.bold("Everyday commands")}
  $ dont-repeat log decision "auth lives in src/lib/session.ts"
  $ dont-repeat log command "pnpm test needs redis" -t tests
  $ dont-repeat list
  $ dont-repeat search auth
  $ dont-repeat doctor

${pc.bold("From session notes")}
  $ dont-repeat distill notes.txt          # preview
  $ dont-repeat distill notes.txt --apply  # save

${pc.bold("Get unstuck")}
  $ dont-repeat guide                      # full beginner guide
  $ dont-repeat help log                   # help for one command
  $ dont-repeat --help                     # this screen

${pc.bold("Memory types for log")}
  failure | do_not | decision | gotcha | command | fact

${pc.dim("Docs: https://github.com/xCaptaiN09/dont-repeat")}
`;

program
  .name("dont-repeat")
  .description(
    [
      "Local failure & decision memory for AI coding agents.",
      "Stop paying them to make the same mistake twice.",
      "",
      "Works with Claude Code, Codex, Gemini CLI, OpenCode, Cursor, and more.",
      "Run `dont-repeat guide` for a full setup walkthrough.",
    ].join("\n"),
  )
  .version(VERSION, "-V, --version", "Show version number")
  .helpOption("-h, --help", "Show help and examples")
  .addHelpText("after", HELP_EXAMPLES);

program
  .command("guide")
  .description("Print a beginner-friendly setup & usage guide")
  .action(() => {
    printGuide();
  });

program
  .command("init")
  .description("Set up dont-repeat in the current project (run this first)")
  .option(
    "-a, --agents <list>",
    "Which tools to wire: claude,codex,gemini,opencode,cursor,generic,all",
    "all",
  )
  .option(
    "-b, --budget <tokens>",
    "Max size of MEMORY.md in tokens (default 600)",
    String(DEFAULT_TOKEN_BUDGET),
  )
  .option("--force", "Re-wire agent files even if already initialized")
  .addHelpText(
    "after",
    `
Examples:
  $ dont-repeat init
  $ dont-repeat init --agents claude,codex
  $ dont-repeat init --budget 800
`,
  )
  .action((opts: { agents: string; budget: string; force?: boolean }) => {
    const projectRoot = rootOpt();
    let agents;
    try {
      agents = parseAgents(opts.agents);
    } catch (e) {
      fail(String(e instanceof Error ? e.message : e));
    }
    const budget = Number(opts.budget);
    if (!Number.isFinite(budget) || budget < 100) {
      fail("budget must be a number >= 100");
    }

    const already = isInitialized(projectRoot);
    let store = already
      ? loadStore(projectRoot)
      : createEmptyStore(projectRoot, agents, budget);

    if (already && !opts.force) {
      updateMeta(store, { agents, tokenBudget: budget });
    } else if (!already) {
      store = createEmptyStore(projectRoot, agents, budget);
    } else {
      updateMeta(store, { agents, tokenBudget: budget });
    }

    persist(projectRoot, store);
    ensureGitignore(projectRoot);

    const results = installAdapters(projectRoot, agents);
    ok(
      already
        ? `Updated dont-repeat in ${projectRoot}`
        : `Initialized dont-repeat in ${projectRoot}`,
    );
    info(`  store:  ${storeDir(projectRoot)}/`);
    info(`  memory: ${memoryPath(projectRoot)}`);
    info(`  budget: ~${budget} tokens`);
    info(`  agents: ${agents.join(", ")}`);
    console.log();
    for (const r of results) {
      console.log(pc.cyan(`  [${r.agent}]`));
      for (const n of r.notes) info(`    ${n}`);
    }
    console.log();
    console.log(pc.bold("Next:"));
    info('  dont-repeat log failure "do not use X — use Y instead"');
    info("  dont-repeat log decision \"auth lives in src/lib/session.ts\"");
    info("  dont-repeat status");
  });

program
  .command("log")
  .description("Save a lesson (failure, decision, command, …)")
  .argument("<type>", `Type: ${MEMORY_TYPES.join(" | ")}`)
  .argument("<summary>", "Short one-line memory (keep it under ~100 chars)")
  .option("-d, --detail <text>", "Optional extra detail")
  .option("-t, --tags <list>", "Comma-separated tags, e.g. tests,auth")
  .option("-p, --paths <list>", "Related file paths, comma-separated")
  .addHelpText(
    "after",
    `
Examples:
  $ dont-repeat log failure "do not use jest for e2e — use playwright"
  $ dont-repeat log decision "auth lives in src/lib/session.ts" -p src/lib/session.ts
  $ dont-repeat log command "pnpm test:e2e needs redis" -t tests
  $ dont-repeat log do_not "do not commit .env"
  $ dont-repeat log gotcha "CI is Node 20 only"
`,
  )
  .action(
    (
      type: string,
      summary: string,
      opts: { detail?: string; tags?: string; paths?: string },
    ) => {
      if (!MEMORY_TYPES.includes(type as MemoryType)) {
        fail(`invalid type "${type}". Use: ${MEMORY_TYPES.join(", ")}`);
      }
      const projectRoot = rootOpt();
      const store = loadStore(projectRoot);
      const entry = addEntry(store, {
        type: type as MemoryType,
        summary,
        detail: opts.detail,
        tags: splitList(opts.tags),
        paths: splitList(opts.paths),
        source: "manual",
      });
      persist(projectRoot, store);
      ok(`Logged ${pc.bold(entry.type)} ${pc.dim(entry.id)}`);
      console.log(`  ${entry.summary}`);
    },
  );

program
  .command("list")
  .description("Show saved memories")
  .option("--type <type>", `Filter by type (${MEMORY_TYPES.join(", ")})`)
  .option("--tag <tag>", "Filter by tag")
  .option("-a, --all", "Include forgotten/expired entries")
  .addHelpText(
    "after",
    `
Examples:
  $ dont-repeat list
  $ dont-repeat list --type failure
  $ dont-repeat list --tag tests
`,
  )
  .action((opts: { type?: string; tag?: string; all?: boolean }) => {
    const projectRoot = rootOpt();
    const store = loadStore(projectRoot);
    if (opts.type && !MEMORY_TYPES.includes(opts.type as MemoryType)) {
      fail(`invalid type "${opts.type}"`);
    }
    const items = listEntries(store, {
      type: opts.type as MemoryType | undefined,
      tag: opts.tag,
      includeInactive: opts.all,
    });
    if (!items.length) {
      info("No entries.");
      return;
    }
    for (const e of items) {
      const st = e.status !== "active" ? pc.dim(` (${e.status})`) : "";
      console.log(
        `${pc.yellow(e.id.slice(0, 10))} ${pc.cyan(e.type.padEnd(8))} ${e.summary}${st}`,
      );
    }
    info(`\n${items.length} entr${items.length === 1 ? "y" : "ies"}`);
  });

program
  .command("search")
  .description("Find memories containing a word or phrase")
  .argument("<query>", "Search query")
  .option("-a, --all", "Include forgotten/expired entries")
  .addHelpText(
    "after",
    `
Examples:
  $ dont-repeat search auth
  $ dont-repeat search playwright
`,
  )
  .action((query: string, opts: { all?: boolean }) => {
    const projectRoot = rootOpt();
    const store = loadStore(projectRoot);
    const items = listEntries(store, {
      query,
      includeInactive: opts.all,
    });
    if (!items.length) {
      info("No matches.");
      return;
    }
    for (const e of items) {
      console.log(
        `${pc.yellow(e.id.slice(0, 10))} ${pc.cyan(e.type.padEnd(8))} ${e.summary}`,
      );
      if (e.detail) info(`           ${e.detail}`);
    }
  });

program
  .command("forget")
  .description("Remove a memory (soft-delete by id; prefix is ok)")
  .argument("<id>", "Full id or unique prefix from list/search")
  .addHelpText(
    "after",
    `
Examples:
  $ dont-repeat list
  $ dont-repeat forget mrksod44
`,
  )
  .action((id: string) => {
    const projectRoot = rootOpt();
    const store = loadStore(projectRoot);
    const matches = store.entries.filter(
      (e) => e.id === id || e.id.startsWith(id),
    );
    if (matches.length === 0) fail(`no entry matching "${id}"`);
    if (matches.length > 1) {
      fail(
        `ambiguous id "${id}" matches ${matches.length} entries: ${matches.map((m) => m.id.slice(0, 10)).join(", ")}`,
      );
    }
    const entry = forgetEntry(store, matches[0].id);
    if (!entry) fail("failed to expire");
    persist(projectRoot, store);
    ok(`Forgot ${entry.id.slice(0, 10)} — ${entry.summary}`);
  });

program
  .command("render")
  .description("Rebuild MEMORY.md (what agents actually read)")
  .option("-q, --quiet", "No success message (used by hooks)")
  .action((opts: { quiet?: boolean }) => {
    const projectRoot = rootOpt();
    const store = loadStore(projectRoot);
    const md = persist(projectRoot, store);
    if (!opts.quiet) {
      ok(`Rendered ${memoryPath(projectRoot)}`);
      info(`  ~${estimateTokens(md)} tokens · budget ${store.meta.tokenBudget}`);
    }
  });

program
  .command("status")
  .description("Show how many memories you have and token usage")
  .action(() => {
    const projectRoot = rootOpt();
    if (!isInitialized(projectRoot)) {
      fail(`not initialized in ${projectRoot}. Run: dont-repeat init`);
    }
    const store = loadStore(projectRoot);
    const active = store.entries.filter((e) => e.status === "active");
    const ranked = rankEntries(store.entries, store.meta.tokenBudget);
    const byType: Record<string, number> = {};
    for (const e of active) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
    }

    console.log(pc.bold("dont-repeat status"));
    info(`  root:    ${projectRoot}`);
    info(`  agents:  ${store.meta.agents.join(", ") || "(none)"}`);
    info(`  budget:  ~${store.meta.tokenBudget} tokens`);
    info(`  active:  ${active.length} (showing ${ranked.length} in MEMORY.md)`);
    info(`  total:   ${store.entries.length} (incl. expired/superseded)`);
    if (Object.keys(byType).length) {
      info(
        `  types:   ${Object.entries(byType)
          .map(([k, v]) => `${k}=${v}`)
          .join("  ")}`,
      );
    }
    if (existsSync(memoryPath(projectRoot))) {
      const md = readFileSync(memoryPath(projectRoot), "utf8");
      info(`  MEMORY:  ~${estimateTokens(md)} tokens`);
    }
    info(`  updated: ${store.meta.updatedAt}`);
  });

program
  .command("budget")
  .description("Set how large MEMORY.md can be (in tokens)")
  .argument("<tokens>", "Token budget, e.g. 600")
  .addHelpText(
    "after",
    `
Examples:
  $ dont-repeat budget 600
  $ dont-repeat budget 1000
`,
  )
  .action((tokens: string) => {
    const n = Number(tokens);
    if (!Number.isFinite(n) || n < 100) fail("tokens must be >= 100");
    const projectRoot = rootOpt();
    const store = loadStore(projectRoot);
    updateMeta(store, { tokenBudget: n });
    const md = persist(projectRoot, store);
    ok(`Budget set to ~${n} tokens`);
    info(`  MEMORY.md now ~${estimateTokens(md)} tokens`);
  });

program
  .command("path")
  .description("Print project root, store, and MEMORY.md paths")
  .action(() => {
    const projectRoot = rootOpt();
    console.log(`root\t${projectRoot}`);
    console.log(`store\t${storeDir(projectRoot)}`);
    console.log(`memory\t${memoryPath(projectRoot)}`);
  });

program
  .command("distill")
  .description(
    "Pull lessons out of notes/transcripts (preview by default; no API key)",
  )
  .argument("[file]", "Notes or transcript file (or pipe text via stdin)")
  .option("--apply", "Save candidates into the store (default: preview only)")
  .option("-n, --max <count>", "Max candidates to keep", "20")
  .addHelpText(
    "after",
    `
Examples:
  $ dont-repeat distill notes.txt
  $ dont-repeat distill notes.txt --apply
  $ echo "FAILURE: never commit .env" | dont-repeat distill --apply

Tip: tag lines in notes for best results:
  FAILURE: ...
  DECISION: ...
  GOTCHA: ...
  COMMAND: ...
`,
  )
  .action(async (file: string | undefined, opts: { apply?: boolean; max: string }) => {
    const projectRoot = rootOpt();
    if (!isInitialized(projectRoot)) {
      fail(`not initialized in ${projectRoot}. Run: dont-repeat init`);
    }
    let raw = "";
    if (file) {
      if (!existsSync(file)) fail(`file not found: ${file}`);
      raw = readFileSync(file, "utf8");
    } else if (!process.stdin.isTTY) {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      raw = Buffer.concat(chunks).toString("utf8");
    } else {
      fail("pass a file path or pipe text on stdin");
    }

    const max = Number(opts.max) || 20;
    const result = distillText(raw, file ?? "stdin");
    const candidates = result.candidates.slice(0, max);

    if (!candidates.length) {
      info("No candidate memories found. Try tagged lines like:");
      info('  FAILURE: do not use jest for e2e');
      info('  DECISION: auth lives in session.ts');
      return;
    }

    console.log(pc.bold(`Found ${candidates.length} candidate(s)`));
    console.log(pc.dim(`  source text ~${extractTextFromTranscript(raw).length} chars`));
    for (const c of candidates) {
      console.log(`  ${pc.cyan(c.type.padEnd(8))} ${c.summary}`);
    }

    if (!opts.apply) {
      console.log();
      info("Preview only. Re-run with --apply to save.");
      return;
    }

    const store = loadStore(projectRoot);
    const existing = new Set(
      listEntries(store).map((e) => `${e.type}:${e.summary.toLowerCase()}`),
    );
    let added = 0;
    for (const c of candidates) {
      const key = `${c.type}:${c.summary.toLowerCase()}`;
      if (existing.has(key)) continue;
      addEntry(store, c);
      existing.add(key);
      added++;
    }
    persist(projectRoot, store);
    ok(`Applied ${added} new memor${added === 1 ? "y" : "ies"} (${candidates.length - added} skipped as duplicates)`);
  });

program
  .command("doctor")
  .description("Check that setup looks healthy (files, budget, hooks)")
  .addHelpText(
    "after",
    `
Example:
  $ dont-repeat doctor
`,
  )
  .action(() => {
    const projectRoot = rootOpt();
    if (!isInitialized(projectRoot)) {
      fail(`not initialized in ${projectRoot}. Run: dont-repeat init`);
    }
    const store = loadStore(projectRoot);
    const findings = runDoctor(projectRoot, store);
    console.log(pc.bold("dont-repeat doctor"));
    let warns = 0;
    let errors = 0;
    for (const f of findings) {
      if (f.level === "ok") console.log(pc.green("  ✓"), f.message);
      else if (f.level === "warn") {
        warns++;
        console.log(pc.yellow("  !"), f.message);
      } else {
        errors++;
        console.log(pc.red("  ✗"), f.message);
      }
    }
    console.log();
    if (errors) fail(`${errors} error(s), ${warns} warning(s)`);
    if (warns) info(`${warns} warning(s) — still usable`);
    else ok("All checks passed");
  });

program
  .command("mcp")
  .description("Start MCP server so agents can log/search memory as tools")
  .addHelpText(
    "after",
    `
Example MCP config (Claude Code / Cursor):
  {
    "mcpServers": {
      "dont-repeat": {
        "command": "dont-repeat",
        "args": ["mcp"]
      }
    }
  }

Tools exposed: memory_log, memory_search, memory_list, memory_status, memory_render
`,
  )
  .action(() => {
    startMcpServer();
  });

function printGuide(): void {
  const lines = [
    pc.bold(pc.cyan("dont-repeat — beginner guide")),
    "",
    pc.bold("What is this?"),
    "  AI coding agents forget between sessions. dont-repeat keeps a small",
    "  local notebook of failures, decisions, and working commands so they",
    "  stop repeating the same mistakes.",
    "",
    pc.bold("1) Install (once)"),
    "  npm install -g dont-repeat",
    "  dont-repeat --version",
    "",
    pc.bold("2) Setup in a project (once per repo)"),
    "  cd your-project",
    "  dont-repeat init",
    "  # optional: only Claude + Codex",
    "  # dont-repeat init --agents claude,codex",
    "",
    "  This creates:",
    "    .agent-memory/store.json   — your memory database",
    "    .agent-memory/MEMORY.md    — short file agents read",
    "    CLAUDE.md / AGENTS.md / …  — pointers so agents load MEMORY.md",
    "",
    pc.bold("3) Log lessons while you work"),
    '  dont-repeat log failure "do not use X — use Y instead"',
    '  dont-repeat log decision "we keep auth in session.ts"',
    '  dont-repeat log command "pnpm test needs redis on 6379"',
    '  dont-repeat log do_not "do not commit .env"',
    "",
    pc.bold("4) Check things look good"),
    "  dont-repeat status     # counts + token usage",
    "  dont-repeat doctor     # wiring health check",
    "  dont-repeat list       # see all memories",
    "  dont-repeat search auth",
    "",
    pc.bold("5) Use your coding agent as usual"),
    "  Open Claude Code / Codex / Gemini / Cursor in the same project.",
    "  They should respect MEMORY.md via the instruction files from init.",
    "",
    pc.bold("Optional extras"),
    "  dont-repeat distill notes.txt --apply   # extract lessons from notes",
    "  dont-repeat mcp                         # MCP tools for agents",
    "  dont-repeat budget 800                  # allow a larger MEMORY.md",
    "  dont-repeat forget <id>                 # remove a bad entry",
    "",
    pc.bold("Get help anytime"),
    "  dont-repeat --help",
    "  dont-repeat help log",
    "  dont-repeat guide",
    "",
    pc.dim("Privacy: everything stays local. .agent-memory/ is gitignored by default."),
    pc.dim("Docs: https://github.com/xCaptaiN09/dont-repeat"),
    pc.dim(`Version: ${VERSION}`),
  ];
  console.log(lines.join("\n"));
}

function splitList(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function ensureGitignore(projectRoot: string): void {
  const gi = join(projectRoot, ".gitignore");
  const line = ".agent-memory/";
  if (!existsSync(gi)) {
    writeFileSync(gi, `${line}\n`, "utf8");
    return;
  }
  const cur = readFileSync(gi, "utf8");
  if (cur.includes(".agent-memory")) return;
  appendFileSync(gi, (cur.endsWith("\n") ? "" : "\n") + `${line}\n`, "utf8");
}

program.parseAsync(process.argv).catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
