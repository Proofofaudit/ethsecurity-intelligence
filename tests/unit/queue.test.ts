import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { ResearchJob } from "@/lib/domain/schemas";
import { loadJobs, runQueue, type JobSpec } from "@/research/queue";

let file: string;
beforeEach(async () => {
  file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "esi-queue-")), "jobs.json");
});

const spec = (initiativeId: string, run: () => Promise<number>, inputHash = "h1"): JobSpec => ({ initiativeId, task: "github", inputHash, run });

describe("research queue", () => {
  it("isolates a failed job and resumes it on the next run without rerunning the others", async () => {
    const calls: string[] = [];
    const ok = (id: string) => async () => {
      calls.push(id);
      return 1;
    };
    const first = await runQueue(
      [
        spec("a", ok("a")),
        spec("b", async () => {
          calls.push("b");
          throw new Error("GitHub returned 502");
        }),
        spec("c", ok("c")),
      ],
      { file, concurrency: 1 },
    );
    const byId = new Map(first.map((j) => [j.initiativeId, j]));
    expect(byId.get("a")?.state).toBe("succeeded");
    expect(byId.get("c")?.state).toBe("succeeded");
    expect(byId.get("b")).toMatchObject({ state: "failed", attempts: 1, error: "GitHub returned 502" });
    // Persisted to disk.
    expect((await loadJobs(file)).find((j) => j.initiativeId === "b")?.state).toBe("failed");

    calls.length = 0;
    const second = await runQueue([spec("a", ok("a")), spec("b", ok("b")), spec("c", ok("c"))], { file });
    expect(calls).toEqual(["b"]);
    expect(second.find((j) => j.initiativeId === "b")).toMatchObject({ state: "succeeded", attempts: 2, error: null, resultCount: 1 });
  });

  it("stops retrying after maxAttempts", async () => {
    let n = 0;
    const failing = spec("x", async () => {
      n++;
      throw new Error("down");
    });
    for (let i = 0; i < 4; i++) await runQueue([failing], { file, maxAttempts: 3 });
    expect(n).toBe(3);
    expect((await loadJobs(file))[0]).toMatchObject({ state: "failed", attempts: 3 });
  });

  it("recovers jobs interrupted while running", async () => {
    const interrupted: ResearchJob = {
      id: "y:github",
      initiativeId: "y",
      task: "github",
      state: "running",
      attempts: 1,
      inputHash: "h1",
      startedAt: "2026-11-26T00:00:00.000Z",
      finishedAt: null,
      error: null,
      resultCount: null,
    };
    await fs.writeFile(file, JSON.stringify([interrupted]));
    const jobs = await runQueue([spec("y", async () => 7)], { file });
    expect(jobs[0]).toMatchObject({ state: "succeeded", resultCount: 7, attempts: 2 });
  });

  it("reruns jobs when the input changes or the result expires", async () => {
    let n = 0;
    const run = async () => ++n;
    await runQueue([spec("z", run)], { file });
    await runQueue([spec("z", run)], { file });
    expect(n).toBe(1);
    await runQueue([spec("z", run, "h2")], { file });
    expect(n).toBe(2);
    await runQueue([spec("z", run, "h2")], { file, now: () => new Date(Date.now() + 73 * 3600_000) });
    expect(n).toBe(3);
  });
});
