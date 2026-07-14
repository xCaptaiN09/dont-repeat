#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
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

const VERSION = "0.1.0";

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

program
  .name("dont-repeat")
  .description(
    "Persistent failure & decision memory for AI coding agents.\nStop paying them to make the same mistake twice.",
  )
  .version(VERSION);

program
  .command("init")
  .description("Initialize dont-repeat in this project")
  .option(
    "-a, --agents <list>",
    "Comma list: claude,codex,gemini,opencode,cursor,generic,all",
    "all",
  )
  .option(
    "-b, --budget <tokens>",
    "Token budget for MEMORY.md",
    String(DEFAULT_TOKEN_BUDGET),
  )
  .option("--force", "Re-run adapters even if already initialized")
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
  .description("Add a memory entry")
  .argument(
    "<type>",
    `One of: ${MEMORY_TYPES.join(" | ")}`,
  )
  .argument("<summary>", "Short one-line memory")
  .option("-d, --detail <text>", "Optional extra detail")
  .option("-t, --tags <list>", "Comma-separated tags")
  .option("-p, --paths <list>", "Comma-separated related file paths")
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
  .description("List memory entries")
  .option("--type <type>", "Filter by type")
  .option("--tag <tag>", "Filter by tag")
  .option("-a, --all", "Include expired/superseded")
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
  .description("Search memories by text")
  .argument("<query>", "Search query")
  .option("-a, --all", "Include inactive")
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
  .description("Expire a memory by id (prefix ok)")
  .argument("<id>", "Full id or unique prefix")
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
  .description("Rebuild .agent-memory/MEMORY.md from the store")
  .option("-q, --quiet", "Silent success")
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
  .description("Show store health and token usage")
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
  .description("Set MEMORY.md token budget")
  .argument("<tokens>", "Token budget (e.g. 600)")
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
  .description("Print important paths")
  .action(() => {
    const projectRoot = rootOpt();
    console.log(`root\t${projectRoot}`);
    console.log(`store\t${storeDir(projectRoot)}`);
    console.log(`memory\t${memoryPath(projectRoot)}`);
  });

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
