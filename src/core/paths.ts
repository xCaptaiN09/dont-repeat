import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { MEMORY_FILE, STORE_DIR, STORE_FILE } from "./types.js";

/** Walk up from cwd looking for .git or existing .agent-memory */
export function findProjectRoot(start = process.cwd()): string {
  let dir = resolve(start);
  const { root } = { root: resolve("/") };

  while (true) {
    if (existsSync(join(dir, STORE_DIR)) || existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir || dir === root) break;
    dir = parent;
  }
  return resolve(start);
}

export function storeDir(projectRoot: string): string {
  return join(projectRoot, STORE_DIR);
}

export function storePath(projectRoot: string): string {
  return join(storeDir(projectRoot), STORE_FILE);
}

export function memoryPath(projectRoot: string): string {
  return join(storeDir(projectRoot), MEMORY_FILE);
}

export function isInitialized(projectRoot: string): boolean {
  return existsSync(storePath(projectRoot));
}
