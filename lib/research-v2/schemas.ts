/**
 * Curated record schema for team, organization, delivery and claim research (Items 15 to 17).
 * One file per initiative: data/curated/team/<initiative-slug>.json, written by the research agent.
 * Every fact carries a source and a checked-on date. Contact details are rejected outright.
 */
import { z } from "zod";

export const DELIVERY_STATUSES = ["Delivered", "Partly delivered", "No public evidence"] as const;
export const CLAIM_STATUSES = ["Verified", "Not verified", "Contradicted by source"] as const;
export const PAST_WORK_KINDS = ["company", "project", "audit", "cve", "bounty", "talk", "paper"] as const;
export const HANDLE_PUBLISHERS = ["proposal", "website", "profile"] as const;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const SCHEME_RE = /\b(?:mailto|tel|sms|whatsapp):/i;
const URL_IN_TEXT = /https?:\/\/[^\s<>"')]+/g;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?\b/g;
const PHONE_RE = /(?:\+\d[\d\s().-]{7,}\d)|(?:\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})|(?:\b\d{2,4}[\s.-]\d{3,4}[\s.-]\d{3,4}\b)/;

/** True when the text contains an email address, a phone number or a private-contact URL scheme. */
export function hasPrivateContact(text: string): boolean {
  if (EMAIL_RE.test(text) || SCHEME_RE.test(text)) return true;
  const stripped = text.replace(URL_IN_TEXT, " ").replace(ISO_DATE, " ");
  return PHONE_RE.test(stripped);
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectStrings(v, out);
  return out;
}

export const httpUrl = z
  .string()
  .max(2048)
  .refine((u) => {
    try {
      const p = new URL(u);
      return p.protocol === "http:" || p.protocol === "https:";
    } catch {
      return false;
    }
  }, "URL must be http(s)");

export const checkedOn = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?$/, "checkedOn must be a date (YYYY-MM-DD)")
  .refine((s) => Number.isFinite(Date.parse(s)), "checkedOn is not a valid date");

const text = (max = 600) => z.string().trim().min(1).max(max);
const sourceLink = z.object({ label: text(200), url: httpUrl }).strict();
const sources = z.array(sourceLink).min(1, "at least one source is required");

const handle = z
  .object({
    platform: text(40),
    handle: text(80),
    url: httpUrl,
    publishedBy: z.enum(HANDLE_PUBLISHERS),
  })
  .strict();

const pastWork = z
  .object({ label: text(200), kind: z.enum(PAST_WORK_KINDS), url: httpUrl, checkedOn })
  .strict();

const member = z
  .object({
    name: text(120),
    role: text(160),
    pseudonymous: z.boolean(),
    handles: z.array(handle),
    pastWork: z.array(pastWork),
    sourceUrl: httpUrl,
    checkedOn,
  })
  .strict();

const organization = z
  .object({
    name: text(160),
    summary: text(900),
    website: httpUrl.optional(),
    founded: text(40).optional(),
    publicTeamSize: z.number().int().nonnegative().optional(),
    previousFunding: z.array(sourceLink),
    otherProducts: z.array(sourceLink),
    sources,
    checkedOn,
  })
  .strict();

const delivery = z
  .object({
    grant: text(240),
    funder: text(160),
    promised: text(600),
    status: z.enum(DELIVERY_STATUSES),
    sources,
    checkedOn,
    round1RecordId: text(120).optional(),
  })
  .strict();

const claim = z
  .object({
    claim: text(600),
    status: z.enum(CLAIM_STATUSES),
    sources,
    checkedOn,
    method: text(500),
    totalLabel: text(80).optional(),
    breakdown: z
      .array(
        z
          .object({
            label: text(80),
            count: z.number().int().nonnegative(),
            tone: z.enum(["in_scope", "unmatched", "unchecked"]),
          })
          .strict(),
      )
      .max(6)
      .optional(),
  })
  .strict();

export const CuratedTeamRecord = z
  .object({
    members: z.array(member),
    organization: organization.nullable(),
    delivery: z.array(delivery),
    claims: z.array(claim),
    passes: z.object({ team: z.boolean(), delivery: z.boolean(), claims: z.boolean() }).strict(),
    notFound: z.array(text(300)),
    researcher: z.literal("agent"),
    checkedOn,
  })
  .strict()
  .superRefine((rec, ctx) => {
    for (const s of collectStrings(rec)) {
      if (hasPrivateContact(s)) {
        ctx.addIssue({ code: "custom", message: "Email addresses and phone numbers are not allowed in research records" });
        return;
      }
    }
  });
export type CuratedTeamRecord = z.infer<typeof CuratedTeamRecord>;
export type CuratedMember = z.infer<typeof member>;

/** Parses a curated record. Throws a readable error naming the first problem. */
export function parseCuratedTeam(raw: unknown, label = "record"): CuratedTeamRecord {
  const r = CuratedTeamRecord.safeParse(raw);
  if (r.success) return r.data;
  const i = r.error.issues[0]!;
  throw new Error(`${label}: ${i.path.join(".") || "(root)"}: ${i.message}`);
}
