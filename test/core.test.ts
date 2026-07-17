import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addEntry,
  createEmptyStore,
  forgetEntry,
  listEntries,
  persist,
  loadStore,
} from "../src/core/store.js";
import { rankEntries } from "../src/core/ranker.js";
import { estimateTokens } from "../src/core/tokens.js";
import { installAdapters } from "../src/adapters/index.js";
import { existsSync, readFileSync } from "node:fs";
import { memoryPath } from "../src/core/paths.js";

describe("dont-repeat core", () => {
  it("estimates tokens roughly", () => {
    assert.ok(estimateTokens("hello world") > 0);
    assert.ok(estimateTokens("a".repeat(350)) >= 90);
  });

  it("stores, ranks failures first, and renders", () => {
    const dir = mkdtempSync(join(tmpdir(), "dont-repeat-"));
    try {
      const store = createEmptyStore(dir, ["generic"], 400);
      addEntry(store, { type: "fact", summary: "uses TypeScript" });
      addEntry(store, {
        type: "failure",
        summary: "do not use jest for e2e — use playwright",
        tags: ["tests"],
      });
      addEntry(store, {
        type: "decision",
        summary: "auth in src/lib/session.ts",
        paths: ["src/lib/session.ts"],
      });
      persist(dir, store);

      const loaded = loadStore(dir);
      assert.equal(loaded.entries.length, 3);

      const ranked = rankEntries(loaded.entries, 400);
      assert.equal(ranked[0].type, "failure");

      const md = readFileSync(memoryPath(dir), "utf8");
      assert.match(md, /Failures/);
      assert.match(md, /playwright/);
      assert.match(md, /dont-repeat/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("forgets and filters list", () => {
    const dir = mkdtempSync(join(tmpdir(), "dont-repeat-"));
    try {
      const store = createEmptyStore(dir);
      const e = addEntry(store, { type: "gotcha", summary: "Node 20 only" });
      forgetEntry(store, e.id);
      persist(dir, store);
      const active = listEntries(loadStore(dir));
      assert.equal(active.length, 0);
      const all = listEntries(loadStore(dir), { includeInactive: true });
      assert.equal(all.length, 1);
      assert.equal(all[0].status, "expired");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("installs multi-agent adapters", () => {
    const dir = mkdtempSync(join(tmpdir(), "dont-repeat-"));
    try {
      const store = createEmptyStore(dir, ["claude", "codex", "gemini"], 500);
      persist(dir, store);
      const results = installAdapters(dir, [
        "claude",
        "codex",
        "gemini",
        "cursor",
        "agy",
        "hermes",
      ]);
      // +1 for HOW_TO_CONNECT always written first
      assert.ok(results.length >= 6);
      assert.ok(existsSync(join(dir, "CLAUDE.md")));
      assert.ok(existsSync(join(dir, "AGENTS.md")));
      assert.ok(existsSync(join(dir, "GEMINI.md")));
      assert.ok(existsSync(join(dir, "HERMES.md")));
      assert.ok(existsSync(join(dir, ".cursor", "rules", "dont-repeat.mdc")));
      assert.ok(existsSync(join(dir, ".agent-memory", "HOW_TO_CONNECT.md")));
      const claude = readFileSync(join(dir, "CLAUDE.md"), "utf8");
      assert.match(claude, /dont-repeat:start/);
      assert.match(claude, /MEMORY\.md/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

