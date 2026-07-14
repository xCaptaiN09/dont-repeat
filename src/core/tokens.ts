/**
 * Rough token estimate for English/code markdown.
 * ~4 chars per token is a common heuristic; we add a small safety margin.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}
