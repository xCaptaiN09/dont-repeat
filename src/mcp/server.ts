#!/usr/bin/env node
/**
 * Minimal MCP stdio server for dont-repeat.
 * Tools: memory_log, memory_search, memory_list, memory_status, memory_render
 *
 * Wire into Claude Code / Cursor MCP config:
 *   { "command": "dont-repeat", "args": ["mcp"] }
 */
import { createInterface } from "node:readline";
import { findProjectRoot, isInitialized } from "../core/paths.js";
import {
  addEntry,
  listEntries,
  loadStore,
  persist,
} from "../core/store.js";
import { estimateTokens } from "../core/tokens.js";
import { rankEntries } from "../core/ranker.js";
import type { MemoryType } from "../core/types.js";
import { MEMORY_TYPES } from "../core/types.js";
import { readFileSync, existsSync } from "node:fs";
import { memoryPath } from "../core/paths.js";

const SERVER_INFO = {
  name: "dont-repeat",
  version: "0.2.0",
};

type Json = Record<string, unknown>;

function respond(id: unknown, result: unknown): void {
  const msg = { jsonrpc: "2.0", id, result };
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function respondError(id: unknown, code: number, message: string): void {
  const msg = {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function textContent(text: string) {
  return { content: [{ type: "text", text }] };
}

function getRoot(): string {
  return process.env.DONT_REPEAT_ROOT || findProjectRoot(process.cwd());
}

function requireStore() {
  const root = getRoot();
  if (!isInitialized(root)) {
    throw new Error(`dont-repeat not initialized in ${root}. Run: dont-repeat init`);
  }
  return { root, store: loadStore(root) };
}

const TOOLS = [
  {
    name: "memory_log",
    description:
      "Log a durable project memory (failure, decision, command, gotcha, do_not, fact). Prefer failure/do_not when something should not be retried.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: MEMORY_TYPES,
          description: "Memory type",
        },
        summary: { type: "string", description: "Short one-line memory" },
        detail: { type: "string", description: "Optional extra detail" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional tags",
        },
        paths: {
          type: "array",
          items: { type: "string" },
          description: "Related file paths",
        },
      },
      required: ["type", "summary"],
    },
  },
  {
    name: "memory_search",
    description: "Search project memories by text",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_list",
    description: "List active project memories, optionally filtered by type",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: MEMORY_TYPES },
      },
    },
  },
  {
    name: "memory_status",
    description: "Show memory store health and token budget usage",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "memory_render",
    description: "Rebuild MEMORY.md from the store (token-budgeted inject file)",
    inputSchema: { type: "object", properties: {} },
  },
];

async function handleTool(name: string, args: Json): Promise<string> {
  switch (name) {
    case "memory_log": {
      const type = String(args.type || "") as MemoryType;
      if (!MEMORY_TYPES.includes(type)) {
        throw new Error(`invalid type; use one of: ${MEMORY_TYPES.join(", ")}`);
      }
      const summary = String(args.summary || "").trim();
      if (!summary) throw new Error("summary required");
      const { root, store } = requireStore();
      const entry = addEntry(store, {
        type,
        summary,
        detail: args.detail ? String(args.detail) : undefined,
        tags: Array.isArray(args.tags) ? args.tags.map(String) : ["mcp"],
        paths: Array.isArray(args.paths) ? args.paths.map(String) : [],
        source: "session",
      });
      persist(root, store);
      return `Logged ${entry.type} ${entry.id}: ${entry.summary}`;
    }
    case "memory_search": {
      const query = String(args.query || "");
      const { store } = requireStore();
      const items = listEntries(store, { query });
      if (!items.length) return "No matches.";
      return items
        .map((e) => `${e.id.slice(0, 10)} [${e.type}] ${e.summary}`)
        .join("\n");
    }
    case "memory_list": {
      const type = args.type ? (String(args.type) as MemoryType) : undefined;
      const { store } = requireStore();
      const items = listEntries(store, { type });
      if (!items.length) return "No entries.";
      return items
        .map((e) => `${e.id.slice(0, 10)} [${e.type}] ${e.summary}`)
        .join("\n");
    }
    case "memory_status": {
      const { root, store } = requireStore();
      const active = listEntries(store);
      const ranked = rankEntries(store.entries, store.meta.tokenBudget);
      let memTokens = 0;
      if (existsSync(memoryPath(root))) {
        memTokens = estimateTokens(readFileSync(memoryPath(root), "utf8"));
      }
      return [
        `root: ${root}`,
        `active: ${active.length} (in MEMORY.md: ${ranked.length})`,
        `budget: ${store.meta.tokenBudget}`,
        `MEMORY.md tokens: ~${memTokens}`,
        `agents: ${store.meta.agents.join(", ")}`,
      ].join("\n");
    }
    case "memory_render": {
      const { root, store } = requireStore();
      const md = persist(root, store);
      return `Rendered MEMORY.md (~${estimateTokens(md)} tokens)`;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function handleMessage(msg: Json): void {
  const id = msg.id;
  const method = String(msg.method || "");
  const params = (msg.params || {}) as Json;

  try {
    if (method === "initialize") {
      respond(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
      return;
    }
    if (method === "notifications/initialized" || method === "initialized") {
      return; // notification — no response
    }
    if (method === "tools/list") {
      respond(id, { tools: TOOLS });
      return;
    }
    if (method === "tools/call") {
      const name = String(params.name || "");
      const args = (params.arguments || {}) as Json;
      handleTool(name, args)
        .then((text) => respond(id, textContent(text)))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          respond(id, {
            content: [{ type: "text", text: `Error: ${message}` }],
            isError: true,
          });
        });
      return;
    }
    if (method === "ping") {
      respond(id, {});
      return;
    }
    // Ignore other notifications
    if (id === undefined || id === null) return;
    respondError(id, -32601, `Method not found: ${method}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (id !== undefined && id !== null) respondError(id, -32000, message);
  }
}

export function startMcpServer(): void {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      handleMessage(JSON.parse(trimmed) as Json);
    } catch {
      // ignore malformed
    }
  });
}

// Allow direct execution
const isDirect =
  process.argv[1]?.endsWith("mcp/server.js") ||
  process.argv[1]?.endsWith("mcp/server.ts");
if (isDirect) {
  startMcpServer();
}
