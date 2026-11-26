/**
 * Public web checks: reachability, final URL, <title> and meta description.
 * Only the first 256 KB of a page is read. Pages are never executed or followed beyond
 * redirects. All fetched text is treated as untrusted data: it is stored as short,
 * length-limited strings and never interpreted as instructions.
 */
import path from "node:path";
import { fetchWithRetry } from "@/lib/util/http";
import { sha256 } from "@/lib/util/hash";
import { RESEARCH_DIR, readJson, writeJson } from "./store";

const CACHE_DIR = path.join(RESEARCH_DIR, "cache", "http");
const TTL_MS = Number(process.env.RESEARCH_TTL_HOURS ?? 72) * 3600_000;

export interface UrlCheck {
  url: string;
  status: number | null;
  finalUrl: string | null;
  title: string | null;
  description: string | null;
  contentType: string | null;
  ok: boolean;
  /** Bot protection or rate limiting: reachability could not be determined. */
  inconclusive: boolean;
  error: string | null;
  checkedAt: string;
}

export let webRequests = 0;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function sanitizeSnippet(s: string | null | undefined, max = 240): string | null {
  if (!s) return null;
  const clean = decodeEntities(s)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

async function readLimited(res: Response, limit = 256 * 1024): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

export async function checkUrl(url: string): Promise<UrlCheck> {
  const file = path.join(CACHE_DIR, `${sha256(url)}.json`);
  const cached = await readJson<UrlCheck>(file);
  if (cached && Date.now() - Date.parse(cached.checkedAt) < TTL_MS) return cached;
  webRequests++;
  const checkedAt = new Date().toISOString();
  let result: UrlCheck;
  try {
    const res = await fetchWithRetry(url, { timeoutMs: 15_000, retries: 1, backoffMs: 1500, headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8" } });
    const contentType = res.headers.get("content-type");
    let title: string | null = null;
    let description: string | null = null;
    if (contentType?.includes("html")) {
      const html = await readLimited(res);
      title = sanitizeSnippet(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1], 160);
      description = sanitizeSnippet(
        /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ??
          /<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["'](?:description|og:description)["']/i.exec(html)?.[1],
      );
    } else {
      await res.body?.cancel().catch(() => undefined);
    }
    const inconclusive = res.status === 403 || res.status === 429 || res.status === 503;
    result = {
      url,
      status: res.status,
      finalUrl: res.url || url,
      title,
      description,
      contentType,
      ok: res.status >= 200 && res.status < 400,
      inconclusive,
      error: null,
      checkedAt,
    };
  } catch (err) {
    result = { url, status: null, finalUrl: null, title: null, description: null, contentType: null, ok: false, inconclusive: true, error: String(err instanceof Error ? err.message : err).slice(0, 200), checkedAt };
  }
  await writeJson(file, result, false);
  return result;
}
