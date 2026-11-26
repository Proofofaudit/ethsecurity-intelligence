/**
 * Deterministic lexical similarity (TF-IDF cosine) and BM25 relevance search.
 * No embeddings or model calls: results are reproducible from the published dataset.
 */
import { tokenize } from "@/lib/util/text";

export interface Doc {
  id: string;
  text: string;
}

export interface TfIdfIndex {
  ids: string[];
  vectors: Map<string, Map<string, number>>;
  idf: Map<string, number>;
}

function bigrams(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]} ${tokens[i + 1]}`);
  return out;
}

export function buildTfIdf(docs: Doc[]): TfIdfIndex {
  const df = new Map<string, number>();
  const tfs = new Map<string, Map<string, number>>();
  for (const d of docs) {
    const toks = tokenize(d.text);
    const terms = [...toks, ...bigrams(toks)];
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    tfs.set(d.id, tf);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const N = docs.length;
  const idf = new Map<string, number>();
  for (const [t, n] of df) idf.set(t, Math.log((N + 1) / (n + 1)) + 1);
  const vectors = new Map<string, Map<string, number>>();
  for (const [id, tf] of tfs) {
    const v = new Map<string, number>();
    let norm = 0;
    for (const [t, c] of tf) {
      // Terms in nearly every document carry no signal; drop them.
      if ((df.get(t) ?? 0) > N * 0.6) continue;
      const w = (1 + Math.log(c)) * (idf.get(t) ?? 0);
      v.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    vectors.set(id, v);
  }
  return { ids: docs.map((d) => d.id), vectors, idf };
}

export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let s = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [t, w] of small) {
    const o = large.get(t);
    if (o) s += w * o;
  }
  return s;
}

/** Terms contributing most to the similarity of two documents. */
export function sharedTerms(a: Map<string, number>, b: Map<string, number>, n = 6): string[] {
  const contrib: [string, number][] = [];
  for (const [t, w] of a) {
    const o = b.get(t);
    if (o) contrib.push([t, w * o]);
  }
  contrib.sort((x, y) => y[1] - x[1]);
  const out: string[] = [];
  for (const [t] of contrib) {
    // Prefer bigrams; skip unigrams already covered by a chosen bigram.
    if (out.some((o) => o.split(" ").includes(t))) continue;
    out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

export interface Bm25Index {
  docs: { id: string; len: number; tf: Map<string, number> }[];
  df: Map<string, number>;
  avgLen: number;
}

export function buildBm25(docs: Doc[]): Bm25Index {
  const df = new Map<string, number>();
  const out = docs.map((d) => {
    const toks = tokenize(d.text);
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return { id: d.id, len: toks.length, tf };
  });
  const avgLen = out.reduce((s, d) => s + d.len, 0) / Math.max(1, out.length);
  return { docs: out, df, avgLen };
}

/** Small, transparent synonym table so common reviewer vocabulary finds proposal wording. */
const SYNONYMS: Record<string, string[]> = {
  wallet: ["wallets", "signer", "signing"],
  signing: ["sign", "signature", "signer", "clear-signing"],
  audit: ["audits", "auditor", "review"],
  fuzzing: ["fuzz", "fuzzer", "fuzzers"],
  monitoring: ["monitor", "alerts", "alerting"],
  phishing: ["scam", "drainer", "poisoning"],
  bounty: ["bounties", "bug"],
  incident: ["incidents", "response", "forensics"],
  "formal": ["verification", "proof", "proofs"],
  opsec: ["operational", "security"],
  ai: ["llm", "agent", "agents", "model"],
};

export function searchBm25(index: Bm25Index, query: string, limit = 20): { id: string; score: number; matched: string[] }[] {
  const base = tokenize(query);
  const terms = [...new Set(base.flatMap((t) => [t, ...(SYNONYMS[t] ?? [])]))];
  const N = index.docs.length;
  const k1 = 1.4;
  const b = 0.75;
  const results: { id: string; score: number; matched: string[] }[] = [];
  for (const d of index.docs) {
    let score = 0;
    const matched: string[] = [];
    for (const t of terms) {
      const f = d.tf.get(t);
      if (!f) continue;
      const n = index.df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const weight = base.includes(t) ? 1 : 0.5;
      score += weight * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / index.avgLen)));
      matched.push(t);
    }
    if (score > 0) results.push({ id: d.id, score, matched });
  }
  return results.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id)).slice(0, limit);
}
