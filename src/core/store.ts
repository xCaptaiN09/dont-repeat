import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { newId } from "./ids.js";
import { memoryPath, storeDir, storePath } from "./paths.js";
import { rankEntries } from "./ranker.js";
import { renderMemoryMarkdown } from "./render.js";
import type {
  AgentId,
  LogInput,
  MemoryEntry,
  MemoryStore,
  MemoryType,
  StoreMeta,
} from "./types.js";
import { DEFAULT_TOKEN_BUDGET } from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

export function createEmptyStore(
  projectRoot: string,
  agents: AgentId[] = ["generic"],
  tokenBudget = DEFAULT_TOKEN_BUDGET,
): MemoryStore {
  const t = nowIso();
  return {
    meta: {
      version: 1,
      projectRoot,
      createdAt: t,
      updatedAt: t,
      tokenBudget,
      agents,
    },
    entries: [],
  };
}

export function loadStore(projectRoot: string): MemoryStore {
  const path = storePath(projectRoot);
  if (!existsSync(path)) {
    throw new Error(
      `dont-repeat is not initialized in ${projectRoot}. Run: dont-repeat init`,
    );
  }
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as MemoryStore;
}

export function saveStore(projectRoot: string, store: MemoryStore): void {
  mkdirSync(storeDir(projectRoot), { recursive: true });
  store.meta.updatedAt = nowIso();
  store.meta.projectRoot = projectRoot;
  writeFileSync(storePath(projectRoot), JSON.stringify(store, null, 2) + "\n", "utf8");
}

export function writeRenderedMemory(projectRoot: string, store: MemoryStore): string {
  const ranked = rankEntries(store.entries, store.meta.tokenBudget);
  const md = renderMemoryMarkdown(ranked, store.meta);
  mkdirSync(storeDir(projectRoot), { recursive: true });
  writeFileSync(memoryPath(projectRoot), md, "utf8");
  return md;
}

export function persist(projectRoot: string, store: MemoryStore): string {
  saveStore(projectRoot, store);
  return writeRenderedMemory(projectRoot, store);
}

export function addEntry(store: MemoryStore, input: LogInput): MemoryEntry {
  const t = nowIso();
  const entry: MemoryEntry = {
    id: newId(),
    type: input.type,
    summary: input.summary.trim(),
    detail: input.detail?.trim() || undefined,
    tags: input.tags ?? [],
    paths: input.paths ?? [],
    status: "active",
    source: input.source ?? "manual",
    createdAt: t,
    updatedAt: t,
    sessionId: input.sessionId,
    confidence: input.confidence,
  };
  if (!entry.summary) {
    throw new Error("summary is required");
  }
  store.entries.push(entry);
  return entry;
}

/**
 * Add only if no active entry has a very similar summary (avoids hook spam).
 * Returns null when skipped as duplicate.
 */
export function addEntryUnlessDuplicate(
  store: MemoryStore,
  input: LogInput,
): MemoryEntry | null {
  const summary = input.summary.trim().toLowerCase();
  if (!summary) throw new Error("summary is required");
  const needle = summary.slice(0, 60);
  const dup = store.entries.some(
    (e) =>
      e.status === "active" &&
      e.type === input.type &&
      (e.summary.toLowerCase() === summary ||
        e.summary.toLowerCase().includes(needle) ||
        summary.includes(e.summary.toLowerCase().slice(0, 60))),
  );
  if (dup) return null;
  return addEntry(store, input);
}

export function forgetEntry(store: MemoryStore, id: string): MemoryEntry | null {
  const entry = store.entries.find((e) => e.id === id || e.id.startsWith(id));
  if (!entry) return null;
  entry.status = "expired";
  entry.updatedAt = nowIso();
  return entry;
}

export function supersedeEntry(
  store: MemoryStore,
  oldId: string,
  input: LogInput,
): { old: MemoryEntry; neu: MemoryEntry } | null {
  const old = store.entries.find((e) => e.id === oldId || e.id.startsWith(oldId));
  if (!old) return null;
  old.status = "superseded";
  old.updatedAt = nowIso();
  const neu = addEntry(store, input);
  neu.supersedes = old.id;
  return { old, neu };
}

export function listEntries(
  store: MemoryStore,
  opts: {
    type?: MemoryType;
    tag?: string;
    includeInactive?: boolean;
    query?: string;
  } = {},
): MemoryEntry[] {
  let items = store.entries;
  if (!opts.includeInactive) {
    items = items.filter((e) => e.status === "active");
  }
  if (opts.type) {
    items = items.filter((e) => e.type === opts.type);
  }
  if (opts.tag) {
    const t = opts.tag.toLowerCase();
    items = items.filter((e) => e.tags.some((x) => x.toLowerCase() === t));
  }
  if (opts.query) {
    const q = opts.query.toLowerCase();
    items = items.filter(
      (e) =>
        e.summary.toLowerCase().includes(q) ||
        e.detail?.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)) ||
        e.paths.some((p) => p.toLowerCase().includes(q)),
    );
  }
  return items.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function updateMeta(
  store: MemoryStore,
  patch: Partial<Pick<StoreMeta, "tokenBudget" | "agents">>,
): void {
  if (patch.tokenBudget !== undefined) store.meta.tokenBudget = patch.tokenBudget;
  if (patch.agents !== undefined) store.meta.agents = patch.agents;
}
