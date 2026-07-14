import { randomBytes } from "node:crypto";

/** Short unique id (time + random), filesystem-safe. */
export function newId(): string {
  const t = Date.now().toString(36);
  const r = randomBytes(3).toString("hex");
  return `${t}-${r}`;
}
