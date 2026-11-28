/**
 * Evidence correction and dispute workflow.
 *
 * Public submissions never modify research records. A moderator moves a correction through
 * the state machine; only "accepted" and "partially_accepted" corrections with an explicit
 * `appliedChange` are overlaid onto claims at read time (dashboard, API, MCP and exports all
 * read through the same overlay). Private contact details are optional, encrypted with
 * AES-256-GCM, never returned by any public interface, and deleted after CONTACT_RETENTION_DAYS.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { CorrectionCategory, EvidenceStatus, type Claim, type Correction, type CorrectionState, type Dataset, type PublicCorrection } from "@/lib/domain/schemas";
import { stableId } from "@/lib/util/hash";

export const CORRECTION_NOTICE =
  "Help us improve the accuracy of this research. If information is incorrect, outdated or missing important context, please submit supporting evidence.";

export const CATEGORY_LABEL: Record<z.infer<typeof CorrectionCategory>, string> = {
  incorrect: "Information is incorrect",
  outdated: "Information is outdated",
  missing_context: "Missing important context",
  missing_evidence: "Evidence exists that we did not consider",
  misattributed: "Attributed to the wrong person or organization",
  other: "Other",
};

export const STATE_LABEL: Record<CorrectionState, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  disputed: "Disputed",
  accepted: "Accepted",
  partially_accepted: "Partially accepted",
  rejected: "Rejected with reasoning",
  resolved: "Resolved",
};

/** Allowed moderator transitions. */
export const TRANSITIONS: Record<CorrectionState, CorrectionState[]> = {
  submitted: ["under_review", "rejected"],
  under_review: ["disputed", "accepted", "partially_accepted", "rejected"],
  disputed: ["under_review", "accepted", "partially_accepted", "rejected"],
  accepted: ["resolved"],
  partially_accepted: ["resolved"],
  rejected: ["under_review"],
  resolved: [],
};

const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine((u) => u.startsWith("https://"), "Evidence links must use https://");

export const SubmissionSchema = z
  .object({
    targetType: z.enum(["claim", "initiative"]),
    targetId: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9_-]+$/),
    category: CorrectionCategory,
    proposedCorrection: z.string().trim().min(10).max(4000),
    evidenceUrl: httpsUrl,
    explanation: z.string().trim().min(20).max(6000),
    attribution: z.string().trim().max(120).optional().nullable(),
    contact: z.string().trim().max(200).optional().nullable(),
    /** Honeypot: must be empty. */
    website: z.string().max(0).optional().default(""),
    /** Milliseconds the form was open; very fast submissions are rejected. */
    elapsedMs: z.number().int().min(0).max(86_400_000),
  })
  .strict();
export type Submission = z.infer<typeof SubmissionSchema>;

export const ModerationSchema = z
  .object({
    to: z.enum(["under_review", "disputed", "accepted", "partially_accepted", "rejected", "resolved"]),
    note: z.string().trim().max(2000).optional().nullable(),
    resolution: z.string().trim().max(4000).optional().nullable(),
    appliedChange: z
      .object({ status: EvidenceStatus.optional(), assertion: z.string().trim().min(5).max(1000).optional(), limitation: z.string().trim().min(5).max(600).optional() })
      .strict()
      .optional()
      .nullable(),
  })
  .strict();
export type Moderation = z.infer<typeof ModerationSchema>;

export function submitterKey(ip: string, salt = process.env.RATE_LIMIT_SALT ?? "dev-only-salt"): string {
  return createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

export function encryptContact(plain: string, keyB64 = process.env.CONTACT_ENCRYPTION_KEY): string {
  if (!keyB64) throw new Error("CONTACT_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("CONTACT_ENCRYPTION_KEY must be 32 bytes (base64)");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}

export function decryptContact(cipher: string, keyB64 = process.env.CONTACT_ENCRYPTION_KEY): string {
  if (!keyB64) throw new Error("CONTACT_ENCRYPTION_KEY is not configured");
  const [v, iv, tag, data] = cipher.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unknown ciphertext format");
  const d = createDecipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

/** Private contact details are kept for at most this many days, then deleted. */
export const CONTACT_RETENTION_DAYS = 30;
const RETENTION_MS = CONTACT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Deletion time for a contact stored at `submittedAt`. */
export const contactExpiry = (submittedAt: string): string => new Date(Date.parse(submittedAt) + RETENTION_MS).toISOString();

/**
 * Removes an expired contact ciphertext. Records without `contactExpiresAt` (saved before the
 * field existed) expire 30 days after submission. Returns the same object when nothing expired.
 */
export function purgeExpiredContact(c: Correction, now: Date = new Date()): Correction {
  if (!c.contactCiphertext) return c;
  const expiresAt = c.contactExpiresAt ?? contactExpiry(c.submittedAt);
  if (Date.parse(expiresAt) > now.getTime()) return c;
  return { ...c, contactCiphertext: null, contactExpiresAt: null };
}

export interface SpamCheck {
  ok: boolean;
  reason: string | null;
}

export function spamCheck(s: Submission, recentCount: number): SpamCheck {
  if (s.website) return { ok: false, reason: "Rejected" };
  if (s.elapsedMs < 4000) return { ok: false, reason: "Please take a moment to review your submission before sending." };
  if (recentCount >= 5) return { ok: false, reason: "Too many submissions from this network in the last hour. Please try again later." };
  const links = (s.explanation.match(/https?:\/\//g) ?? []).length + (s.proposedCorrection.match(/https?:\/\//g) ?? []).length;
  if (links > 10) return { ok: false, reason: "Too many links. Please keep the most relevant evidence." };
  return { ok: true, reason: null };
}

export function newCorrection(s: Submission, key: string, initiativeId: string | null, now = new Date().toISOString()): Correction {
  const contactCiphertext = s.contact?.trim() ? encryptContact(s.contact.trim()) : null;
  return {
    id: stableId("cor", key, s.targetId, now, randomBytes(4).toString("hex")),
    targetType: s.targetType,
    targetId: s.targetId,
    initiativeId,
    category: s.category,
    proposedCorrection: s.proposedCorrection,
    evidenceUrl: s.evidenceUrl,
    explanation: s.explanation,
    attribution: s.attribution?.trim() || null,
    contactCiphertext,
    contactExpiresAt: contactCiphertext ? contactExpiry(now) : null,
    state: "submitted",
    resolution: null,
    appliedChange: null,
    submittedAt: now,
    updatedAt: now,
    history: [{ at: now, state: "submitted", note: null }],
    submitterKey: key,
  };
}

export function moderate(c: Correction, m: Moderation, now = new Date().toISOString()): Correction {
  const allowed = TRANSITIONS[c.state];
  if (!allowed.includes(m.to)) throw new Error(`Cannot move a correction from ${c.state} to ${m.to}`);
  if ((m.to === "rejected" || m.to === "accepted" || m.to === "partially_accepted") && !m.resolution?.trim())
    throw new Error("A public resolution explaining the decision is required");
  if ((m.to === "accepted" || m.to === "partially_accepted") && c.targetType === "claim" && !m.appliedChange) throw new Error("Accepted claim corrections must specify the applied change");
  return {
    ...c,
    state: m.to,
    resolution: m.resolution?.trim() || c.resolution,
    appliedChange: m.appliedChange ?? c.appliedChange,
    updatedAt: now,
    history: [...c.history, { at: now, state: m.to, note: m.note?.trim() || null }],
  };
}

export function toPublic(c: Correction): PublicCorrection {
  const { contactCiphertext: _c, contactExpiresAt: _e, submitterKey: _k, ...rest } = c;
  void _c;
  void _e;
  void _k;
  return rest;
}

/** States that appear in the public changelog. Open submissions are never published. */
export const CHANGELOG_STATES: CorrectionState[] = ["accepted", "partially_accepted", "rejected", "resolved"];

export interface ChangelogEntry {
  id: string;
  targetType: Correction["targetType"];
  targetId: string;
  initiativeId: string | null;
  category: Correction["category"];
  categoryLabel: string;
  state: CorrectionState;
  stateLabel: string;
  resolution: string | null;
  appliedChange: Correction["appliedChange"];
  /** Submitter text is published only for corrections a moderator accepted. */
  proposedCorrection: string | null;
  evidenceUrl: string | null;
  attribution: string | null;
  submittedAt: string;
  updatedAt: string;
  /** State history without internal moderator notes. */
  history: { at: string; state: CorrectionState; stateLabel: string }[];
}

/**
 * Public changelog view. Built on toPublic() (no contact ciphertext, no submitter key), then
 * drops internal moderator notes. Rejected submissions show only the category and the public
 * reasoning, so unverified text is never republished.
 */
export function toChangelogEntry(c: Correction): ChangelogEntry | null {
  if (!CHANGELOG_STATES.includes(c.state)) return null;
  const p = toPublic(c);
  const accepted = p.history.some((h) => h.state === "accepted" || h.state === "partially_accepted");
  return {
    id: p.id,
    targetType: p.targetType,
    targetId: p.targetId,
    initiativeId: p.initiativeId,
    category: p.category,
    categoryLabel: CATEGORY_LABEL[p.category],
    state: p.state,
    stateLabel: STATE_LABEL[p.state],
    resolution: p.resolution,
    appliedChange: accepted ? p.appliedChange : null,
    proposedCorrection: accepted ? p.proposedCorrection : null,
    evidenceUrl: accepted ? p.evidenceUrl : null,
    attribution: accepted ? p.attribution : null,
    submittedAt: p.submittedAt,
    updatedAt: p.updatedAt,
    history: p.history.map((h) => ({ at: h.at, state: h.state, stateLabel: STATE_LABEL[h.state] })),
  };
}

const APPLIED: CorrectionState[] = ["accepted", "partially_accepted", "resolved"];

/** Overlay accepted corrections onto claims. Returns a new dataset; never mutates input. */
export function applyCorrections(d: Dataset, corrections: Correction[]): Dataset {
  const applicable = corrections
    .filter((c) => APPLIED.includes(c.state) && c.targetType === "claim" && c.appliedChange)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  if (!applicable.length) return d;
  const byClaim = new Map<string, Correction[]>();
  for (const c of applicable) byClaim.set(c.targetId, [...(byClaim.get(c.targetId) ?? []), c]);
  const claims: Claim[] = d.claims.map((cl) => {
    const cs = byClaim.get(cl.id);
    if (!cs) return cl;
    let next = { ...cl, history: [...cl.history], limitations: [...cl.limitations] };
    for (const c of cs) {
      const ch = c.appliedChange ?? {};
      next = {
        ...next,
        status: ch.status ?? next.status,
        assertion: ch.assertion ?? next.assertion,
        limitations: ch.limitation ? [...next.limitations, ch.limitation] : next.limitations,
        history: [...next.history, { at: c.updatedAt, status: ch.status ?? next.status, assertion: ch.assertion ?? next.assertion, reason: `Correction ${c.id} ${STATE_LABEL[c.state].toLowerCase()}: ${c.resolution ?? ""}`.trim(), correctionId: c.id }],
      };
    }
    return next;
  });
  const changes = [
    ...applicable.map((c) => ({
      id: stableId("chg", "cor", c.id),
      initiativeId: c.initiativeId,
      detectedAt: c.updatedAt,
      kind: "correction_published" as const,
      summary: `Correction ${STATE_LABEL[c.state].toLowerCase()}: ${c.resolution ?? c.proposedCorrection}`.slice(0, 300),
      source: "correction" as const,
      fromSnapshot: null,
      toSnapshot: null,
    })),
    ...d.changes,
  ].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  return { ...d, claims, changes };
}
