/**
 * Shared helpers for the public /api/v1 route handlers: query parsing with zod, a consistent
 * JSON error shape, pagination and client IP extraction. Route files stay thin and call the
 * shared intelligence service; nothing here queries the store with user-supplied filters.
 */
import { z } from "zod";
import type { Dataset } from "@/lib/domain/schemas";
import type { IntelligenceStore, StoreHealth } from "@/lib/db/types";
import { envelope } from "@/lib/intelligence/service";
import { loadIntelligence } from "@/lib/intelligence/load";

export type ErrorCode =
  | "bad_request"
  | "not_found"
  | "unauthorized"
  | "conflict"
  | "payload_too_large"
  | "rate_limited"
  | "unavailable"
  | "internal_error";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new ApiError(400, "bad_request", message);
export const notFound = (message: string) => new ApiError(404, "not_found", message);

const PUBLIC_CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

export function json(body: unknown, init: { status?: number; headers?: Record<string, string>; cache?: "public" | "private" } = {}): Response {
  return Response.json(body, {
    status: init.status ?? 200,
    headers: { "Cache-Control": init.cache === "public" ? PUBLIC_CACHE : "no-store", ...init.headers },
  });
}

export function errorResponse(status: number, code: ErrorCode, message: string, headers?: Record<string, string>): Response {
  return json({ error: { code, message } }, { status, headers });
}

function zodMessage(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "Invalid request";
  const where = issue.path.length ? issue.path.join(".") : "request";
  return `${where}: ${issue.message}`;
}

/** Wraps a route handler so every failure maps to {error:{code,message}} with a fitting status. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return errorResponse(err.status, err.code, err.message);
      if (err instanceof z.ZodError) return errorResponse(400, "bad_request", zodMessage(err));
      console.error("[api] unexpected error:", err instanceof Error ? err.message : String(err));
      return errorResponse(500, "internal_error", "Unexpected server error");
    }
  };
}

export interface Loaded {
  dataset: Dataset;
  store: IntelligenceStore;
  health: StoreHealth;
}

/** Loads the published dataset with accepted corrections applied, or fails with 503. */
export async function load(): Promise<Loaded> {
  let loaded: Loaded;
  try {
    loaded = await loadIntelligence();
  } catch (err) {
    console.error("[api] dataset unavailable:", err instanceof Error ? err.message : String(err));
    throw new ApiError(503, "unavailable", "The research dataset is temporarily unavailable");
  }
  return loaded;
}

/** Success body: data wrapped with sources, freshness, methodology and limitations. */
export function ok<T>(d: Dataset, data: T, extra: Parameters<typeof envelope>[2] = {}, init: Parameters<typeof json>[1] = { cache: "public" }): Response {
  return json(envelope(d, data, extra), init);
}

// ───────────────────────────── Query parsing ─────────────────────────────

export interface QueryShape {
  arrays?: string[];
  numbers?: string[];
  booleans?: string[];
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

/**
 * Converts URLSearchParams to a plain object for zod validation. Array keys accept repeated
 * parameters or comma-separated values. Values that are not valid numbers or booleans are
 * left as strings so the schema rejects them rather than silently coercing.
 */
export function queryObject(sp: URLSearchParams, shape: QueryShape = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(sp.keys())) {
    const values = sp.getAll(key);
    if (shape.arrays?.includes(key)) {
      out[key] = values.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
      continue;
    }
    if (values.length > 1) throw badRequest(`${key}: parameter given more than once`);
    const v = values[0] ?? "";
    if (shape.numbers?.includes(key)) out[key] = NUMERIC.test(v) ? Number(v) : v;
    else if (shape.booleans?.includes(key)) out[key] = v === "true" || v === "1" ? true : v === "false" || v === "0" ? false : v;
    else out[key] = v;
  }
  return out;
}

export function parseQuery<S extends z.ZodType>(req: Request, schema: S, shape: QueryShape = {}): z.infer<S> {
  const sp = new URL(req.url).searchParams;
  const parsed = schema.safeParse(queryObject(sp, shape));
  if (!parsed.success) throw badRequest(zodMessage(parsed.error));
  return parsed.data;
}

export async function parseJsonBody<S extends z.ZodType>(req: Request, schema: S, maxBytes = 32_768): Promise<z.infer<S>> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError(413, "payload_too_large", `Request body exceeds ${maxBytes} bytes`);
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new ApiError(413, "payload_too_large", `Request body exceeds ${maxBytes} bytes`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw badRequest(zodMessage(parsed.error));
  return parsed.data;
}

// ───────────────────────────── Pagination ─────────────────────────────

export const MAX_LIMIT = 100;

export const PageFields = {
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  offset: z.number().int().min(0).optional(),
  cursor: z.string().max(40).regex(/^[A-Za-z0-9_-]+$/).optional(),
};
export const PAGE_NUMBERS = ["limit", "offset"];

export const encodeCursor = (offset: number) => Buffer.from(`o:${offset}`, "utf8").toString("base64url");

export function decodeCursor(cursor: string): number {
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const m = /^o:(\d{1,7})$/.exec(raw);
  if (!m) throw badRequest("cursor: invalid cursor");
  return Number(m[1]);
}

/** Resolves limit/offset/cursor (cursor wins over offset). */
export function pageOf(q: { limit?: number; offset?: number; cursor?: string }, defaultLimit = 50) {
  if (q.cursor !== undefined && q.offset !== undefined) throw badRequest("Use either cursor or offset, not both");
  return { limit: q.limit ?? defaultLimit, offset: q.cursor !== undefined ? decodeCursor(q.cursor) : (q.offset ?? 0) };
}

export function paginate<T>(items: T[], page: { limit: number; offset: number }) {
  const slice = items.slice(page.offset, page.offset + page.limit);
  const next = page.offset + slice.length;
  return { total: items.length, limit: page.limit, offset: page.offset, nextCursor: next < items.length ? encodeCursor(next) : null, items: slice };
}

// ───────────────────────────── Misc ─────────────────────────────

/**
 * Client IP for rate limiting. Uses the first X-Forwarded-For entry set by the hosting proxy,
 * then X-Real-IP. The value is only ever stored as an HMAC (see submitterKey).
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  if (first) return first.slice(0, 64);
  const real = req.headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 64) : "unknown";
}

export const IdParam = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/, "invalid identifier");

export function idFrom(value: string | undefined, label = "id"): string {
  const parsed = IdParam.safeParse(value === undefined ? undefined : decodeURIComponent(value));
  if (!parsed.success) throw badRequest(`${label}: invalid identifier`);
  return parsed.data;
}

export type Ctx<P extends Record<string, string>> = { params: Promise<P> };
