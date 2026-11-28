/**
 * FileStore deletes private contact ciphertexts 30 days after submission, on every read and
 * write, using a temporary state directory. The clock is faked with explicit dates.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Correction } from "@/lib/domain/schemas";

let dir: string;
let FileStore: typeof import("@/lib/db/file-store").FileStore;

const correction = (id: string, over: Partial<Correction> = {}): Correction => ({
  id,
  targetType: "claim",
  targetId: "clm_test",
  initiativeId: null,
  category: "incorrect",
  proposedCorrection: "The figure is different in the official record.",
  evidenceUrl: "https://example.org/evidence",
  explanation: "Explanation that is long enough for validation.",
  attribution: null,
  contactCiphertext: null,
  contactExpiresAt: null,
  state: "submitted",
  resolution: null,
  appliedChange: null,
  submittedAt: "2026-11-20T10:00:00.000Z",
  updatedAt: "2026-11-20T10:00:00.000Z",
  history: [{ at: "2026-11-20T10:00:00.000Z", state: "submitted", note: null }],
  submitterKey: "key-a",
  ...over,
});

const stored = async () => JSON.parse(await fs.readFile(path.join(dir, "corrections.json"), "utf8")) as Correction[];

beforeAll(async () => {
  // file-store resolves the corrections path at import time.
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "esi-retention-"));
  process.env.ESI_LOCAL_STATE_DIR = dir;
  ({ FileStore } = await import("@/lib/db/file-store"));
});

describe("FileStore contact retention", () => {
  it("purges at 30 days, keeps everything else and reports the count", async () => {
    const store = new FileStore();
    await fs.writeFile(
      path.join(dir, "corrections.json"),
      JSON.stringify([correction("cor_a", { contactCiphertext: "v1.a.b.c", contactExpiresAt: "2026-12-20T10:00:00.000Z" }), correction("cor_b")]),
    );
    expect(await store.purgeExpiredContacts(new Date("2026-12-20T09:59:59.000Z"))).toBe(0);
    expect((await stored())[0]!.contactCiphertext).toBe("v1.a.b.c");
    expect(await store.purgeExpiredContacts(new Date("2026-12-20T10:00:00.000Z"))).toBe(1);
    const after = await stored();
    expect(after[0]).toEqual({ ...correction("cor_a"), contactCiphertext: null, contactExpiresAt: null });
    expect(after[1]).toEqual(correction("cor_b"));
  });

  it("removes expired contacts from the file on read, without being asked", async () => {
    const store = new FileStore();
    await fs.writeFile(path.join(dir, "corrections.json"), JSON.stringify([correction("cor_c", { contactCiphertext: "v1.x.y.z", contactExpiresAt: "2020-01-01T00:00:00.000Z" })]));
    expect((await store.getCorrection("cor_c"))?.contactCiphertext).toBeNull();
    expect((await stored())[0]!.contactCiphertext).toBeNull();
  });

  it("never writes an expired contact back during create or update", async () => {
    const store = new FileStore();
    await fs.writeFile(path.join(dir, "corrections.json"), "[]");
    await store.createCorrection(correction("cor_d", { contactCiphertext: "v1.d.d.d", contactExpiresAt: "2020-01-01T00:00:00.000Z" }));
    expect((await stored())[0]!.contactCiphertext).toBeNull();
    const live = correction("cor_e", { contactCiphertext: "v1.e.e.e", contactExpiresAt: "2999-01-01T00:00:00.000Z" });
    await store.createCorrection(live);
    expect((await store.getCorrection("cor_e"))?.contactCiphertext).toBe("v1.e.e.e");
    expect(await store.updateCorrection("cor_e", "submitted", { ...live, state: "under_review", contactExpiresAt: "2020-01-01T00:00:00.000Z" })).toBe(true);
    expect((await stored()).find((c) => c.id === "cor_e")).toMatchObject({ state: "under_review", contactCiphertext: null });
  });

  it("a read-only degraded store filters expired contacts without rewriting the file", async () => {
    await fs.writeFile(path.join(dir, "corrections.json"), JSON.stringify([correction("cor_f", { contactCiphertext: "v1.f.f.f", contactExpiresAt: "2020-01-01T00:00:00.000Z" })]));
    const degraded = new FileStore("database offline");
    expect((await degraded.listCorrections())[0]!.contactCiphertext).toBeNull();
    expect((await stored())[0]!.contactCiphertext).toBe("v1.f.f.f");
  });
});
