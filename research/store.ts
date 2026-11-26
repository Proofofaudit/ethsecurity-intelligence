/**
 * Content-addressed, append-only file store for official snapshots and research artefacts.
 * Objects are written once under data/official/objects/<sha256>.json; snapshot manifests
 * reference them by hash, so unchanged initiatives are never duplicated across syncs.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { sha256, stableStringify } from "@/lib/util/hash";

export const DATA_DIR = path.resolve(process.env.ESI_DATA_DIR ?? path.join(process.cwd(), "data"));
export const OFFICIAL_DIR = path.join(DATA_DIR, "official");
export const OBJECTS_DIR = path.join(OFFICIAL_DIR, "objects");
export const SNAPSHOTS_DIR = path.join(OFFICIAL_DIR, "snapshots");
export const REVISIONS_DIR = path.join(OFFICIAL_DIR, "revisions");
export const RESEARCH_DIR = path.join(DATA_DIR, "research");
export const PUBLISHED_DIR = path.join(DATA_DIR, "published");

export async function ensureDirs(): Promise<void> {
  for (const d of [OBJECTS_DIR, SNAPSHOTS_DIR, REVISIONS_DIR, RESEARCH_DIR, PUBLISHED_DIR]) await fs.mkdir(d, { recursive: true });
}

export async function writeObject(value: unknown): Promise<string> {
  const body = stableStringify(value);
  const hash = sha256(body);
  const file = path.join(OBJECTS_DIR, `${hash}.json`);
  try {
    await fs.access(file);
  } catch {
    await atomicWrite(file, body);
  }
  return hash;
}

export async function readObject<T = unknown>(hash: string): Promise<T> {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(`Invalid object hash ${hash}`);
  return JSON.parse(await fs.readFile(path.join(OBJECTS_DIR, `${hash}.json`), "utf8")) as T;
}

export async function atomicWrite(file: string, body: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, body);
  await fs.rename(tmp, file);
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeJson(file: string, value: unknown, pretty = true): Promise<void> {
  await atomicWrite(file, pretty ? `${JSON.stringify(value, null, 2)}\n` : JSON.stringify(value));
}

export interface SnapshotManifest {
  snapshotId: string;
  createdAt: string;
  officialGeneratedAt: string;
  previousSnapshotId: string | null;
  /** Hash of the raw ballot list response (stable-stringified). */
  ballotObject: string;
  /** Per initiative slug: hash of detail response and comments response. */
  initiatives: Record<string, { id: string; detail: string; comments: string | null; detailFetchedAt: string; stale: boolean }>;
  requests: number;
  failedRequests: { url: string; error: string }[];
  validation: { check: string; ok: boolean; detail: string }[];
  status: "valid" | "invalid";
}

export async function listSnapshots(): Promise<string[]> {
  try {
    return (await fs.readdir(SNAPSHOTS_DIR)).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
  } catch {
    return [];
  }
}

export async function readSnapshot(id: string): Promise<SnapshotManifest | null> {
  return readJson<SnapshotManifest>(path.join(SNAPSHOTS_DIR, `${id}.json`));
}

export async function latestValidSnapshot(): Promise<SnapshotManifest | null> {
  const ids = await listSnapshots();
  for (let i = ids.length - 1; i >= 0; i--) {
    const s = await readSnapshot(ids[i] as string);
    if (s?.status === "valid") return s;
  }
  return null;
}
