/**
 * Native HTTP helpers: timeouts, bounded retries with exponential backoff and
 * Retry-After support, and a bounded-concurrency mapper. No browser extraction
 * services are used, so JSON escaping is preserved byte-for-byte.
 */
export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  headers?: Record<string, string>;
  method?: "GET" | "HEAD";
  /** Treat these statuses as final (no retry). */
  finalStatuses?: number[];
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status: number | null,
    public readonly attempts: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const USER_AGENT =
  "ETHSecurityIntelligence/0.1 (+https://github.com/Proofofaudit/ethsecurity-intelligence; research crawler; low volume)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 20_000, retries = 3, backoffMs = 750, headers = {}, method = "GET" } = opts;
  const finalStatuses = new Set(opts.finalStatuses ?? [400, 401, 403, 404, 405, 410, 451]);
  let lastError: unknown = null;
  let lastStatus: number | null = null;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: { "user-agent": USER_AGENT, accept: "application/json, text/html;q=0.9, */*;q=0.5", ...headers },
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timer);
      lastStatus = res.status;
      if (res.ok || finalStatuses.has(res.status)) return res;
      if (attempt <= retries && (res.status === 429 || res.status >= 500)) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : backoffMs * 2 ** (attempt - 1);
        await res.body?.cancel().catch(() => undefined);
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt <= retries) {
        await sleep(backoffMs * 2 ** (attempt - 1));
        continue;
      }
    }
  }
  throw new HttpError(
    `Request failed after ${retries + 1} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    url,
    lastStatus,
    retries + 1,
  );
}

export async function fetchJson(url: string, opts: FetchOptions = {}): Promise<{ status: number; body: unknown; raw: string }> {
  const res = await fetchWithRetry(url, opts);
  const raw = await res.text();
  if (!res.ok) throw new HttpError(`HTTP ${res.status} for ${url}`, url, res.status, 1);
  try {
    return { status: res.status, body: JSON.parse(raw) as unknown, raw };
  } catch {
    throw new HttpError(`Malformed JSON from ${url}`, url, res.status, 1);
  }
}

/** Map with at most `limit` promises in flight; results preserve input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return results;
}
