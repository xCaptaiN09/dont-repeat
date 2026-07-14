/** Memory entry types — failure-first by design. */
export type MemoryType =
  | "failure"
  | "decision"
  | "fact"
  | "command"
  | "gotcha"
  | "do_not";

export type MemoryStatus = "active" | "superseded" | "expired";

export type MemorySource = "manual" | "session" | "hook" | "import";

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  summary: string;
  detail?: string;
  tags: string[];
  paths: string[];
  status: MemoryStatus;
  source: MemorySource;
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
  confidence?: number;
  /** If this entry supersedes another */
  supersedes?: string;
}

export interface StoreMeta {
  version: 1;
  projectRoot: string;
  createdAt: string;
  updatedAt: string;
  /** Soft token budget for rendered MEMORY.md */
  tokenBudget: number;
  /** Which agent adapters were installed */
  agents: AgentId[];
}

export type AgentId =
  | "claude"
  | "codex"
  | "gemini"
  | "opencode"
  | "cursor"
  | "generic";

export interface MemoryStore {
  meta: StoreMeta;
  entries: MemoryEntry[];
}

export interface LogInput {
  type: MemoryType;
  summary: string;
  detail?: string;
  tags?: string[];
  paths?: string[];
  source?: MemorySource;
  sessionId?: string;
  confidence?: number;
}

export const MEMORY_TYPES: MemoryType[] = [
  "failure",
  "do_not",
  "decision",
  "gotcha",
  "command",
  "fact",
];

/** Higher = more important when packing under budget */
export const TYPE_PRIORITY: Record<MemoryType, number> = {
  failure: 100,
  do_not: 95,
  decision: 80,
  gotcha: 75,
  command: 60,
  fact: 40,
};

export const DEFAULT_TOKEN_BUDGET = 600;

export const STORE_DIR = ".agent-memory";
export const STORE_FILE = "store.json";
export const MEMORY_FILE = "MEMORY.md";
export const MANAGED_START = "<!-- dont-repeat:start -->";
export const MANAGED_END = "<!-- dont-repeat:end -->";
