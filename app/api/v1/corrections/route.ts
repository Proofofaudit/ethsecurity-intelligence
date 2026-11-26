import { z } from "zod";
import { CHANGELOG_STATES, CORRECTION_NOTICE, SubmissionSchema, newCorrection, spamCheck, submitterKey, toChangelogEntry } from "@/lib/corrections";
import { findInitiative } from "@/lib/intelligence/service";
import { ApiError, badRequest, clientIp, handle, IdParam, json, load, notFound, ok, PAGE_NUMBERS, PageFields, pageOf, paginate, parseJsonBody, parseQuery } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_WINDOW_MS = 60 * 60 * 1000;
/** Matches the per-hour limit enforced by spamCheck(). */
const RATE_LIMIT = 5;

const Query = z.object({ initiative: IdParam.optional(), targetId: IdParam.optional(), ...PageFields }).strict();

/** GET /api/v1/corrections: public changelog of moderated corrections (no private data). */
export const GET = handle(async (req: Request) => {
  const q = parseQuery(req, Query, { numbers: PAGE_NUMBERS });
  const page = pageOf(q);
  const { dataset, store } = await load();
  const ini = q.initiative ? findInitiative(dataset, q.initiative) : undefined;
  if (q.initiative && !ini) throw notFound(`No initiative with id or slug "${q.initiative}"`);
  const entries = (await store.listCorrections({ states: CHANGELOG_STATES, initiativeId: ini?.id, targetId: q.targetId }))
    .map(toChangelogEntry)
    .filter((x) => x !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return ok(
    dataset,
    { notice: CORRECTION_NOTICE, ...paginate(entries, page) },
    { limitations: ["Only moderated corrections are listed. Open submissions, private contact details and internal moderator notes are never published."] },
    { cache: "private" },
  );
});

/**
 * POST /api/v1/corrections: submit a correction. It is stored as "submitted" for moderation and
 * never changes research records until a moderator accepts it.
 */
export const POST = handle(async (req: Request) => {
  const s = await parseJsonBody(req, SubmissionSchema);
  const { dataset, store, health } = await load();
  if (health.degraded || !health.ok) throw new ApiError(503, "unavailable", "Corrections are temporarily unavailable. Please try again later.");

  let initiativeId: string | null;
  if (s.targetType === "claim") {
    const claim = dataset.claims.find((c) => c.id === s.targetId);
    if (!claim) throw notFound(`No claim with id "${s.targetId}"`);
    initiativeId = claim.initiativeId;
  } else {
    const ini = findInitiative(dataset, s.targetId);
    if (!ini) throw notFound(`No initiative with id or slug "${s.targetId}"`);
    initiativeId = ini.id;
  }
  if (s.contact?.trim() && !process.env.CONTACT_ENCRYPTION_KEY)
    throw badRequest("contact: private contact details cannot be stored securely right now. Please submit without them.");

  const key = submitterKey(clientIp(req));
  const recent = await store.countSubmissionsSince(key, new Date(Date.now() - RATE_WINDOW_MS).toISOString());
  if (recent >= RATE_LIMIT)
    return json({ error: { code: "rate_limited", message: "Too many submissions from this network in the last hour. Please try again later." } }, { status: 429, headers: { "Retry-After": "3600" } });
  const spam = spamCheck(s, recent);
  if (!spam.ok) throw badRequest(spam.reason ?? "Rejected");

  const correction = newCorrection({ ...s, targetId: s.targetType === "initiative" ? (initiativeId as string) : s.targetId }, key, initiativeId);
  try {
    await store.createCorrection(correction);
  } catch (err) {
    console.error("[api] correction not stored:", err instanceof Error ? err.message : String(err));
    throw new ApiError(503, "unavailable", "Corrections are temporarily unavailable. Please try again later.");
  }
  return ok(
    dataset,
    { id: correction.id, state: correction.state, submittedAt: correction.submittedAt, message: "Thank you. Your submission will be reviewed by a moderator. It does not change any published record until it is accepted." },
    {},
    { status: 201, cache: "private" },
  );
});
