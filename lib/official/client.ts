import { fetchJson, type FetchOptions } from "@/lib/util/http";
import {
  CommentsResponseSchema,
  DetailResponseSchema,
  ListResponseSchema,
  RevisionResponseSchema,
  type CommentsResponse,
  type DetailResponse,
  type ListResponse,
  type RevisionResponse,
} from "./schemas";
import type { z } from "zod";

export const OFFICIAL_BASE = (process.env.OFFICIAL_API_BASE ?? "https://initiatives.thedao.fund").replace(/\/$/, "");

export const officialUrls = {
  ballot: () => `${OFFICIAL_BASE}/api/initiatives.json?status=ballot`,
  schema: () => `${OFFICIAL_BASE}/api/initiatives.schema.json`,
  initiative: (slug: string) => `${OFFICIAL_BASE}/api/initiatives/${encodeURIComponent(slug)}`,
  comments: (slug: string) => `${OFFICIAL_BASE}/api/initiatives/${encodeURIComponent(slug)}/comments`,
  revision: (slug: string, n: number) => `${OFFICIAL_BASE}/api/initiatives/${encodeURIComponent(slug)}/revisions/${n}`,
  page: (slug: string) => `${OFFICIAL_BASE}/initiative/${encodeURIComponent(slug)}`,
};

export class ValidationFailure extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly issues: string[],
  ) {
    super(message);
    this.name = "ValidationFailure";
  }
}

function parseOrThrow<S extends z.ZodType>(schema: S, body: unknown, url: string): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) {
    const issues = r.error.issues.slice(0, 20).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new ValidationFailure(`Response from ${url} failed schema validation`, url, issues);
  }
  return r.data;
}

const politeOpts: FetchOptions = { timeoutMs: 25_000, retries: 3, backoffMs: 1000 };

export async function fetchBallot(): Promise<{ data: ListResponse; raw: string }> {
  const url = officialUrls.ballot();
  const { body, raw } = await fetchJson(url, politeOpts);
  return { data: parseOrThrow(ListResponseSchema, body, url), raw };
}

export async function fetchDetail(slug: string): Promise<DetailResponse> {
  const url = officialUrls.initiative(slug);
  const { body } = await fetchJson(url, politeOpts);
  return parseOrThrow(DetailResponseSchema, body, url);
}

export async function fetchRevision(slug: string, n: number): Promise<RevisionResponse> {
  const url = officialUrls.revision(slug, n);
  const { body } = await fetchJson(url, politeOpts);
  return parseOrThrow(RevisionResponseSchema, body, url);
}

export async function fetchComments(slug: string): Promise<CommentsResponse> {
  const url = officialUrls.comments(slug);
  const { body } = await fetchJson(url, politeOpts);
  return parseOrThrow(CommentsResponseSchema, body, url);
}
