/**
 * File adapter: serves the published dataset from data/published/dataset.json and keeps
 * corrections in .data/corrections.json. Intended for local development and as the
 * read-only fallback when MongoDB is unavailable. Production corrections require MongoDB.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { purgeExpiredContact } from "@/lib/corrections";
import { Dataset as DatasetSchema, type Correction, type CorrectionState, type Dataset } from "@/lib/domain/schemas";
import type { IntelligenceStore, StoreHealth } from "./types";

export const DATASET_PATH = path.join(process.cwd(), "data", "published", "dataset.json");
const CORRECTIONS_PATH = path.join(process.env.ESI_LOCAL_STATE_DIR ?? path.join(process.cwd(), ".data"), "corrections.json");

let cache: { mtimeMs: number; dataset: Dataset } | null = null;

export async function loadPublishedDataset(file = DATASET_PATH): Promise<Dataset> {
  // data/published is included explicitly via outputFileTracingIncludes in next.config.ts; the
  // ignore comments stop Turbopack from tracing the whole project because `file` is a parameter.
  const stat = await fs.stat(/*turbopackIgnore: true*/ file);
  if (cache && cache.mtimeMs === stat.mtimeMs && file === DATASET_PATH) return cache.dataset;
  const parsed = DatasetSchema.safeParse(JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ file, "utf8")));
  if (!parsed.success) throw new Error(`Published dataset failed validation: ${parsed.error.issues[0]?.message}`);
  if (file === DATASET_PATH) cache = { mtimeMs: stat.mtimeMs, dataset: parsed.data };
  return parsed.data;
}

async function readRaw(): Promise<Correction[]> {
  try {
    return JSON.parse(await fs.readFile(CORRECTIONS_PATH, "utf8")) as Correction[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

let writeChain: Promise<unknown> = Promise.resolve();
async function writeCorrections(fn: (all: Correction[]) => Correction[] | null): Promise<boolean> {
  const run = writeChain.then(async () => {
    const all = await readRaw();
    const next = fn(all);
    if (!next) return false;
    await fs.mkdir(path.dirname(CORRECTIONS_PATH), { recursive: true });
    const tmp = `${CORRECTIONS_PATH}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2));
    await fs.rename(tmp, CORRECTIONS_PATH);
    return true;
  });
  writeChain = run.catch(() => undefined);
  return run;
}

export class FileStore implements IntelligenceStore {
  readonly backend = "file" as const;
  constructor(private readonly degradedReason: string | null = null) {}

  getDataset() {
    return loadPublishedDataset();
  }

  /** Rewrites the file without expired contact ciphertexts. Runs before every read and write. */
  async purgeExpiredContacts(now: Date = new Date()) {
    let removed = 0;
    await writeCorrections((all) => {
      const next = all.map((c) => purgeExpiredContact(c, now));
      removed = next.filter((c, i) => c !== all[i]).length;
      return removed ? next : null;
    });
    return removed;
  }

  private async readCorrections(): Promise<Correction[]> {
    // A degraded store is read-only, so it filters in memory instead of rewriting the file.
    if (!this.degradedReason) await this.purgeExpiredContacts();
    return (await readRaw()).map((c) => purgeExpiredContact(c));
  }

  async listCorrections(filter: { states?: CorrectionState[]; targetId?: string; initiativeId?: string } = {}) {
    return (await this.readCorrections())
      .filter((c) => !filter.states || filter.states.includes(c.state))
      .filter((c) => !filter.targetId || c.targetId === filter.targetId)
      .filter((c) => !filter.initiativeId || c.initiativeId === filter.initiativeId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  async getCorrection(id: string) {
    return (await this.readCorrections()).find((c) => c.id === id) ?? null;
  }

  async createCorrection(c: Correction) {
    if (this.degradedReason) throw new Error("Corrections are temporarily unavailable (database offline)");
    await writeCorrections((all) => [...all.map((x) => purgeExpiredContact(x)), purgeExpiredContact(c)]);
  }

  async updateCorrection(id: string, expectedState: CorrectionState, next: Correction) {
    if (this.degradedReason) throw new Error("Corrections are temporarily unavailable (database offline)");
    return writeCorrections((all) => {
      const i = all.findIndex((c) => c.id === id);
      if (i < 0 || all[i]?.state !== expectedState) return null;
      const copy = all.map((x) => purgeExpiredContact(x));
      copy[i] = purgeExpiredContact(next);
      return copy;
    });
  }

  async countSubmissionsSince(key: string, since: string) {
    return (await this.readCorrections()).filter((c) => c.submitterKey === key && c.submittedAt >= since).length;
  }

  async health(): Promise<StoreHealth> {
    try {
      await fs.access(DATASET_PATH);
      return {
        backend: "file",
        ok: true,
        degraded: !!this.degradedReason,
        detail: this.degradedReason ? `MongoDB unavailable (${this.degradedReason}); serving the published dataset file read-only.` : "Serving data/published/dataset.json (no MONGODB_URI configured).",
      };
    } catch {
      return { backend: "file", ok: false, degraded: !!this.degradedReason, detail: "Published dataset file is missing. Run `npm run pipeline`." };
    }
  }
}
