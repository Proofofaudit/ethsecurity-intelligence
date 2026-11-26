/**
 * Durable research job queue (file-backed; mirrored to MongoDB `research_jobs` on db:load).
 *
 * State machine: pending -> running -> succeeded | failed
 *  - Jobs are keyed by (initiativeId, task). A job is re-run when its input hash changes,
 *    when it previously failed (up to maxAttempts), or when its result is older than the TTL.
 *  - Jobs found in "running" at startup were interrupted; they are reset to pending.
 *  - The queue is persisted after every state transition, so a crash loses at most one job.
 *  - One job's failure never stops the others.
 */
import type { ResearchJob, ResearchTask } from "@/lib/domain/schemas";
import { readJson, writeJson } from "./store";

export interface JobSpec {
  initiativeId: string;
  task: ResearchTask;
  inputHash: string;
  run: () => Promise<number>;
}

export interface QueueOptions {
  file: string;
  maxAttempts?: number;
  ttlMs?: number;
  concurrency?: number;
  log?: (m: string) => void;
  now?: () => Date;
}

export async function loadJobs(file: string): Promise<ResearchJob[]> {
  return (await readJson<ResearchJob[]>(file)) ?? [];
}

export async function runQueue(specs: JobSpec[], opts: QueueOptions): Promise<ResearchJob[]> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const ttlMs = opts.ttlMs ?? 72 * 3600_000;
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => undefined);
  const jobs = new Map((await loadJobs(opts.file)).map((j) => [j.id, j]));

  // Recovery: anything left running was interrupted.
  for (const j of jobs.values()) if (j.state === "running") jobs.set(j.id, { ...j, state: "pending", error: "Recovered after interruption" });

  let writing: Promise<void> = Promise.resolve();
  const persist = () => {
    writing = writing.then(() => writeJson(opts.file, [...jobs.values()].sort((a, b) => a.id.localeCompare(b.id))));
    return writing;
  };
  await persist();

  const due = specs.filter((s) => {
    const id = `${s.initiativeId}:${s.task}`;
    const j = jobs.get(id);
    if (!j) return true;
    if (j.inputHash !== s.inputHash) return true;
    if (j.state === "failed") return j.attempts < maxAttempts;
    if (j.state === "pending") return true;
    if (j.state === "succeeded" && j.finishedAt && now().getTime() - Date.parse(j.finishedAt) > ttlMs) return true;
    return false;
  });
  log(`Research queue: ${due.length} due of ${specs.length} jobs`);

  let idx = 0;
  const worker = async () => {
    while (idx < due.length) {
      const s = due[idx++] as JobSpec;
      const id = `${s.initiativeId}:${s.task}`;
      const prev = jobs.get(id);
      const attempts = prev && prev.inputHash === s.inputHash ? prev.attempts + 1 : 1;
      jobs.set(id, { id, initiativeId: s.initiativeId, task: s.task, state: "running", attempts, inputHash: s.inputHash, startedAt: now().toISOString(), finishedAt: null, error: null, resultCount: null });
      await persist();
      try {
        const n = await s.run();
        jobs.set(id, { ...(jobs.get(id) as ResearchJob), state: "succeeded", finishedAt: now().toISOString(), resultCount: n, error: null });
      } catch (err) {
        jobs.set(id, { ...(jobs.get(id) as ResearchJob), state: "failed", finishedAt: now().toISOString(), error: String(err instanceof Error ? err.message : err).slice(0, 300) });
        log(`  job ${id} failed: ${String(err).slice(0, 120)}`);
      }
      await persist();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 3) }, worker));
  await writing;
  return [...jobs.values()];
}
