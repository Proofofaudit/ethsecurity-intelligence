import { z } from "zod";
import { CorrectionState, type Correction } from "@/lib/domain/schemas";
import { ModerationSchema, STATE_LABEL, TRANSITIONS, moderate, toPublic } from "@/lib/corrections";
import { ApiError, handle, IdParam, load, notFound, ok, PAGE_NUMBERS, PageFields, pageOf, paginate, parseJsonBody, parseQuery } from "@/lib/api/http";
import { requireModerator } from "@/lib/api/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Moderator view: everything except the contact ciphertext and the submitter key. */
const moderatorView = (c: Correction) => ({ ...toPublic(c), stateLabel: STATE_LABEL[c.state], hasPrivateContact: !!c.contactCiphertext, allowedTransitions: TRANSITIONS[c.state] });

const Query = z.object({ states: z.array(CorrectionState).max(7).optional(), initiative: IdParam.optional(), ...PageFields }).strict();

/** GET /api/v1/moderation/corrections: moderation queue (requires MODERATOR_TOKEN). */
export const GET = handle(async (req: Request) => {
  requireModerator(req);
  const q = parseQuery(req, Query, { arrays: ["states"], numbers: PAGE_NUMBERS });
  const page = pageOf(q);
  const { dataset, store } = await load();
  const items = (await store.listCorrections({ states: q.states?.length ? q.states : undefined, initiativeId: q.initiative })).map(moderatorView);
  return ok(dataset, paginate(items, page), {}, { cache: "private" });
});

/** `expectedState` is the state the moderator saw; a mismatch returns 409 instead of overwriting. */
const PatchBody = z.object({ id: IdParam, expectedState: CorrectionState.optional(), moderation: ModerationSchema }).strict();

/**
 * PATCH /api/v1/moderation/corrections: move one correction through the state machine. The
 * update is optimistic: it fails with 409 if another moderator changed the state first.
 */
export const PATCH = handle(async (req: Request) => {
  requireModerator(req);
  const body = await parseJsonBody(req, PatchBody);
  const { dataset, store, health } = await load();
  if (health.degraded || !health.ok) throw new ApiError(503, "unavailable", "Moderation is temporarily unavailable (store is read-only)");
  const current = await store.getCorrection(body.id);
  if (!current) throw notFound(`No correction with id "${body.id}"`);
  if (body.expectedState && body.expectedState !== current.state)
    throw new ApiError(409, "conflict", `The correction is now "${current.state}", not "${body.expectedState}". Reload and try again.`);
  let next: Correction;
  try {
    next = moderate(current, body.moderation);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transition not allowed";
    // Disallowed transitions conflict with the current state; missing reasoning is a bad request.
    throw message.startsWith("Cannot move") ? new ApiError(409, "conflict", message) : new ApiError(400, "bad_request", message);
  }
  let updated: boolean;
  try {
    updated = await store.updateCorrection(current.id, current.state, next);
  } catch (err) {
    console.error("[api] moderation update failed:", err instanceof Error ? err.message : String(err));
    throw new ApiError(503, "unavailable", "Moderation is temporarily unavailable");
  }
  if (!updated) throw new ApiError(409, "conflict", "The correction changed since it was read. Reload and try again.");
  return ok(dataset, moderatorView(next), {}, { cache: "private" });
});
