import { randomBytes } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  CONTACT_RETENTION_DAYS,
  SubmissionSchema,
  TRANSITIONS,
  applyCorrections,
  decryptContact,
  encryptContact,
  moderate,
  newCorrection,
  purgeExpiredContact,
  spamCheck,
  submitterKey,
  toPublic,
  type Submission,
} from "@/lib/corrections";
import { loadPublishedDataset } from "@/lib/db/file-store";
import type { Correction, CorrectionState, Dataset } from "@/lib/domain/schemas";

const KEY = randomBytes(32).toString("base64");

const valid = {
  targetType: "claim",
  targetId: "clm_example",
  category: "incorrect",
  proposedCorrection: "The repository was archived in October.",
  evidenceUrl: "https://github.com/example/repo",
  explanation: "The repository page shows an archived banner dated October 2026.",
  elapsedMs: 12_000,
} as const;

const submission = (over: Partial<Submission> = {}): Submission => ({ ...SubmissionSchema.parse(valid), ...over });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SubmissionSchema", () => {
  it("accepts a complete submission and defaults the honeypot to empty", () => {
    const s = SubmissionSchema.parse(valid);
    expect(s.website).toBe("");
  });

  it.each([
    ["http evidence link", { evidenceUrl: "http://example.org" }],
    ["non-URL evidence", { evidenceUrl: "not a url" }],
    ["short explanation", { explanation: "too short" }],
    ["short proposed correction", { proposedCorrection: "short" }],
    ["target id with spaces", { targetId: "clm example" }],
    ["unknown category", { category: "spam" }],
    ["unknown target type", { targetType: "organization" }],
    ["filled honeypot", { website: "https://spam.example" }],
    ["negative elapsed time", { elapsedMs: -1 }],
    ["unexpected field", { admin: true }],
  ])("rejects %s", (_label, patch) => {
    expect(SubmissionSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe("spamCheck", () => {
  it("passes a normal submission", () => {
    expect(spamCheck(submission(), 0)).toEqual({ ok: true, reason: null });
  });
  it("rejects a filled honeypot", () => {
    expect(spamCheck(submission({ website: "x" }), 0).ok).toBe(false);
  });
  it("rejects forms submitted faster than the minimum time", () => {
    expect(spamCheck(submission({ elapsedMs: 3999 }), 0).ok).toBe(false);
    expect(spamCheck(submission({ elapsedMs: 4000 }), 0).ok).toBe(true);
  });
  it("rate limits after five submissions in the window", () => {
    expect(spamCheck(submission(), 4).ok).toBe(true);
    expect(spamCheck(submission(), 5).reason).toMatch(/Too many submissions/);
  });
  it("rejects link floods", () => {
    expect(spamCheck(submission({ explanation: "https://a.example ".repeat(11) }), 0).ok).toBe(false);
  });
});

describe("state machine", () => {
  const base = (state: CorrectionState): Correction => ({ ...newCorrection(submission(), "k", null, "2026-11-20T00:00:00.000Z"), state });
  const ALL: CorrectionState[] = ["submitted", "under_review", "disputed", "accepted", "partially_accepted", "rejected", "resolved"];

  it("defines transitions for every state and none out of resolved", () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...ALL].sort());
    expect(TRANSITIONS.resolved).toEqual([]);
  });

  it("rejects every move that is not listed", () => {
    for (const from of ALL) {
      for (const to of ["under_review", "disputed", "accepted", "partially_accepted", "rejected", "resolved"] as const) {
        const m = { to, resolution: "Decision with reasons.", appliedChange: { status: "disputed" as const } };
        if (TRANSITIONS[from].includes(to)) expect(() => moderate(base(from), m), `${from}→${to}`).not.toThrow();
        else expect(() => moderate(base(from), m), `${from}→${to}`).toThrow(/Cannot move/);
      }
    }
  });

  it("requires a public resolution for decisions and an applied change for accepted claim corrections", () => {
    expect(() => moderate(base("under_review"), { to: "rejected" })).toThrow(/resolution/);
    expect(() => moderate(base("under_review"), { to: "accepted", resolution: "Confirmed." })).toThrow(/applied change/);
    const ok = moderate(base("under_review"), { to: "accepted", resolution: "Confirmed.", appliedChange: { status: "outdated" } }, "2026-11-21T00:00:00.000Z");
    expect(ok.state).toBe("accepted");
    expect(ok.history.at(-1)).toEqual({ at: "2026-11-21T00:00:00.000Z", state: "accepted", note: null });
  });
});

describe("private contact details", () => {
  it("round-trips with the configured key", () => {
    const c = encryptContact("reviewer@example.org", KEY);
    expect(c).not.toContain("reviewer");
    expect(decryptContact(c, KEY)).toBe("reviewer@example.org");
  });

  it("refuses to encrypt or decrypt without a key, and fails with the wrong key", () => {
    vi.stubEnv("CONTACT_ENCRYPTION_KEY", "");
    expect(() => encryptContact("a@b.c", undefined)).toThrow(/not configured/);
    const c = encryptContact("a@b.c", KEY);
    expect(() => decryptContact(c, undefined)).toThrow(/not configured/);
    expect(() => decryptContact(c, randomBytes(32).toString("base64"))).toThrow();
    expect(() => encryptContact("a@b.c", randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });

  it("rejects a contact detail instead of storing plaintext when no key is configured", () => {
    vi.stubEnv("CONTACT_ENCRYPTION_KEY", "");
    expect(() => newCorrection(submission({ contact: "a@b.c" }), "k", null)).toThrow(/not configured/);
    expect(newCorrection(submission(), "k", null).contactCiphertext).toBeNull();
  });

  it("strips the ciphertext and submitter key from public records", () => {
    vi.stubEnv("CONTACT_ENCRYPTION_KEY", KEY);
    const c = newCorrection(submission({ contact: "a@b.c", attribution: "Jane" }), submitterKey("203.0.113.9", "salt"), null);
    expect(c.contactCiphertext).toMatch(/^v1\./);
    const p = toPublic(c) as Record<string, unknown>;
    expect(p).not.toHaveProperty("contactCiphertext");
    expect(p).not.toHaveProperty("contactExpiresAt");
    expect(p).not.toHaveProperty("submitterKey");
    expect(JSON.stringify(p)).not.toContain("a@b.c");
    expect(p.attribution).toBe("Jane");
  });

  it("keeps a private contact optional", () => {
    const c = newCorrection(submission({ contact: "  " }), "k", null);
    expect(c.contactCiphertext).toBeNull();
    expect(c.contactExpiresAt).toBeNull();
    expect(SubmissionSchema.safeParse({ ...valid }).success).toBe(true);
  });

  it("schedules deletion of a private contact 30 days after submission", () => {
    vi.stubEnv("CONTACT_ENCRYPTION_KEY", KEY);
    expect(CONTACT_RETENTION_DAYS).toBe(30);
    const c = newCorrection(submission({ contact: "a@b.c" }), "k", null, "2026-11-20T10:00:00.000Z");
    expect(c.contactExpiresAt).toBe("2026-12-20T10:00:00.000Z");
  });

  it("purges the contact at 30 days with a fake clock and keeps the rest of the correction", () => {
    vi.stubEnv("CONTACT_ENCRYPTION_KEY", KEY);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-20T10:00:00.000Z"));
      const c = newCorrection(submission({ contact: "a@b.c" }), "k", null);
      expect(purgeExpiredContact(c)).toBe(c);
      vi.setSystemTime(new Date("2026-12-20T09:59:59.999Z"));
      expect(purgeExpiredContact(c).contactCiphertext).toMatch(/^v1\./);
      vi.setSystemTime(new Date("2026-12-20T10:00:00.000Z"));
      const purged = purgeExpiredContact(c);
      expect(purged.contactCiphertext).toBeNull();
      expect(purged.contactExpiresAt).toBeNull();
      expect({ ...purged, contactCiphertext: c.contactCiphertext, contactExpiresAt: c.contactExpiresAt }).toEqual(c);
    } finally {
      vi.useRealTimers();
    }
  });

  it("purges records saved before contactExpiresAt existed 30 days after submission", () => {
    vi.stubEnv("CONTACT_ENCRYPTION_KEY", KEY);
    const { contactExpiresAt: _e, ...legacy } = newCorrection(submission({ contact: "a@b.c" }), "k", null, "2026-10-01T00:00:00.000Z");
    void _e;
    expect(purgeExpiredContact(legacy, new Date("2026-10-30T23:59:59.000Z")).contactCiphertext).not.toBeNull();
    expect(purgeExpiredContact(legacy, new Date("2026-10-31T00:00:00.000Z")).contactCiphertext).toBeNull();
  });

  it("derives submitter keys with an HMAC instead of storing the address", () => {
    const k = submitterKey("203.0.113.9", "salt");
    expect(k).toHaveLength(32);
    expect(k).not.toContain("203");
    expect(submitterKey("203.0.113.9", "salt")).toBe(k);
    expect(submitterKey("203.0.113.9", "other")).not.toBe(k);
  });
});

describe("applyCorrections", () => {
  let d: Dataset;
  beforeAll(async () => {
    d = await loadPublishedDataset();
  });

  const make = (claimId: string, state: CorrectionState, id: string): Correction => ({
    ...newCorrection(submission({ targetId: claimId }), "k", null, "2026-11-25T00:00:00.000Z"),
    id,
    state,
    resolution: "Moderator reasoning.",
    appliedChange: { status: "disputed", limitation: "Disputed by a correction with evidence." },
    updatedAt: "2026-11-26T00:00:00.000Z",
  });

  it("propagates accepted corrections and ignores submitted and rejected ones", () => {
    const [a, b, c] = d.claims.filter((x) => x.status !== "disputed");
    const out = applyCorrections(d, [make(a!.id, "accepted", "cor_1"), make(b!.id, "submitted", "cor_2"), make(c!.id, "rejected", "cor_3")]);
    const get = (id: string) => out.claims.find((x) => x.id === id)!;
    expect(get(a!.id).status).toBe("disputed");
    expect(get(a!.id).limitations).toContain("Disputed by a correction with evidence.");
    expect(get(a!.id).history.at(-1)).toMatchObject({ correctionId: "cor_1", status: "disputed" });
    expect(get(b!.id)).toEqual(b);
    expect(get(c!.id)).toEqual(c);
    expect(out.changes.filter((x) => x.kind === "correction_published")).toHaveLength(1);
    expect(out.changes).toHaveLength(d.changes.length + 1);
    // Input is not mutated.
    expect(d.claims.find((x) => x.id === a!.id)?.status).toBe(a!.status);
  });

  it("returns the dataset unchanged when nothing is applicable", () => {
    expect(applyCorrections(d, [])).toBe(d);
    const initiativeLevel = { ...make(d.claims[0]!.id, "accepted", "cor_4"), targetType: "initiative" as const };
    expect(applyCorrections(d, [initiativeLevel])).toBe(d);
  });
});
