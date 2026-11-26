import { createHash } from "node:crypto";

/** Deterministic JSON serialization with sorted object keys. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function contentHash(value: unknown): string {
  return sha256(stableStringify(value));
}

/** Short stable identifier derived from parts, e.g. claim IDs. */
export function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}_${sha256(parts.join("\u001f")).slice(0, 16)}`;
}
