import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { distillText, extractTextFromTranscript } from "../src/core/distill.js";

describe("distill", () => {
  it("extracts tagged and pattern-based memories", () => {
    const notes = `
FAILURE: do not use jest for e2e — use playwright
DECISION: auth lives in src/lib/session.ts
Gotcha: CI is Node 20 only
We decided monorepo with pnpm workspaces.
Use redis instead of in-memory cache for sessions.
$ pnpm test:e2e
never force-push main
`;
    const { candidates } = distillText(notes);
    assert.ok(candidates.length >= 4);
    assert.ok(candidates.some((c) => c.type === "failure" || c.type === "do_not"));
    assert.ok(candidates.some((c) => c.type === "decision"));
    assert.ok(candidates.some((c) => /playwright|jest/i.test(c.summary)));
  });

  it("reads JSON message transcripts", () => {
    const raw = JSON.stringify([
      { role: "user", content: "fix the tests" },
      {
        role: "assistant",
        content: "FAILURE: do not mock the database in integration tests",
      },
    ]);
    const text = extractTextFromTranscript(raw);
    assert.match(text, /do not mock/);
    const { candidates } = distillText(raw);
    assert.ok(candidates.some((c) => /mock/i.test(c.summary)));
  });
});
