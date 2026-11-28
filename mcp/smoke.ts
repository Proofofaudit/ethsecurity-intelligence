/**
 * End-to-end checks run through a real MCP client session: discovery, every tool with valid
 * input, pagination, and predictable errors for invalid input. Used by `npm run mcp:smoke`
 * (stdio or Streamable HTTP) and by the integration test (in-memory transport).
 */
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { TOOLS } from "@/lib/mcp/catalog";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

type Json = Record<string, any>;

export async function runSmoke(client: Client): Promise<{ checks: Check[]; calls: Record<string, number> }> {
  const checks: Check[] = [];
  const calls: Record<string, number> = {};
  const check = (name: string, ok: boolean, detail = "") => checks.push({ name, ok, detail });

  const info = client.getServerVersion();
  check("initialize", !!info?.name, `server ${info?.name ?? "?"} ${info?.version ?? ""}`);
  const instructions = client.getInstructions() ?? "";
  check("instructions mention untrusted content and the cohort", /untrusted/i.test(instructions) && /ballot cohort/.test(instructions), `${instructions.length} characters`);

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  const expected = TOOLS.map((t) => t.name).sort();
  check("tools/list returns the catalog", JSON.stringify(names) === JSON.stringify(expected), `${tools.length} tools`);
  check(
    "every tool is annotated read-only with an object input schema",
    tools.every((t) => t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === false && t.inputSchema.type === "object" && !!t.outputSchema),
  );
  check("input schemas reject unknown properties", tools.every((t) => (t.inputSchema as Json).additionalProperties === false));

  async function call(name: string, args: Json): Promise<CallToolResult> {
    calls[name] = (calls[name] ?? 0) + 1;
    return (await client.callTool({ name, arguments: args })) as CallToolResult;
  }

  /** Valid call: success, envelope metadata and identical text and structured content. */
  async function ok(label: string, name: string, args: Json, extra?: (data: Json) => string | null): Promise<Json | null> {
    try {
      const r = await call(name, args);
      if (r.isError) {
        check(label, false, `isError: ${textOf(r).slice(0, 200)}`);
        return null;
      }
      const sc = r.structuredContent as Json | undefined;
      const parsed = JSON.parse(textOf(r)) as Json;
      const meta = sc?.meta as Json | undefined;
      const problems: string[] = [];
      if (!sc || JSON.stringify(parsed) !== JSON.stringify(sc)) problems.push("text and structuredContent differ");
      if (!meta?.datasetVersion || !meta?.officialDataGeneratedAt || !meta?.methodologyVersion) problems.push("freshness metadata missing");
      if (!Array.isArray(meta?.sources) || meta.sources.length === 0 || !meta.sources.every((s: string) => s.startsWith("https://"))) problems.push("sources missing");
      if (!Array.isArray(meta?.limitations) || !meta.limitations.some((l: string) => /untrusted source content/.test(l))) problems.push("limitations missing");
      const more = extra?.(sc?.data as Json);
      if (more) problems.push(more);
      check(label, problems.length === 0, problems.join("; ") || `${textOf(r).length} characters`);
      return problems.length ? null : (sc?.data as Json);
    } catch (err) {
      check(label, false, err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  /** Invalid call: isError with a message, never a thrown protocol error or a success. */
  async function bad(label: string, name: string, args: Json, code?: string) {
    try {
      const r = await call(name, args);
      const text = textOf(r);
      let gotCode: string | null = null;
      try {
        gotCode = (JSON.parse(text) as Json).error?.code ?? null;
      } catch {
        gotCode = /validation error/i.test(text) ? "invalid_params" : null;
      }
      const pass = r.isError === true && text.length > 0 && (!code || gotCode === code);
      check(label, pass, `${gotCode ?? "no code"}: ${text.slice(0, 140)}`);
    } catch (err) {
      check(label, false, `threw instead of isError: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Discovery through the data itself.
  const page1 = await ok("list_initiatives (first page)", "list_initiatives", { limit: 2 }, (d) => (d.items?.length === 2 && d.nextCursor && d.sort === "title" ? null : "expected 2 alphabetical items and a cursor"));
  if (page1) {
    await ok("list_initiatives (cursor page)", "list_initiatives", { limit: 2, cursor: page1.nextCursor }, (d) => (d.offset === 2 && d.items[0]?.id !== page1.items[0]?.id ? null : "cursor did not advance"));
  }
  await ok("filter_initiatives via list_initiatives", "list_initiatives", { type: "rfp", fields: "full", limit: 50 }, (d) => (d.items.every((i: Json) => i.type === "rfp") ? null : "filter not applied"));
  await ok("list_initiatives text query", "list_initiatives", { q: "fuzzing", limit: 5 }, (d) => (d.sort === "relevance" ? null : "expected relevance order"));

  const all = await ok("list_initiatives (all, compact)", "list_initiatives", { limit: 50 });
  const first = all?.items?.find((i: Json) => i.organizationId && i.claims > 0) as Json | undefined;
  if (!first) {
    check("discover an initiative with claims", false);
    return { checks, calls };
  }
  const second = all?.items?.find((i: Json) => i.id !== first.id) as Json;

  const dossier = await ok("get_initiative (all sections)", "get_initiative", { id: first.slug, sections: ["overview", "proposal", "milestones", "funding", "claims", "evidence", "team", "technical", "reality", "related", "blind_spots", "changes", "revisions", "metrics", "research_jobs"] });
  await ok("get_milestones via get_initiative", "get_initiative", { id: first.id, sections: ["milestones"] }, (d) => (Array.isArray(d.milestones) && d.overview === undefined ? null : "expected only milestones"));
  await ok("get_initiative (default sections)", "get_initiative", { id: first.id }, (d) => (d.overview && d.milestones && d.funding && d.reality ? null : "default sections missing"));

  await ok("get_organization via get_entity", "get_entity", { type: "organization", id: first.organizationId }, (d) => (d.organization?.id === first.organizationId ? null : "wrong organization"));
  const person = dossier?.team?.people?.[0] as Json | undefined;
  if (person) await ok("get_team via get_entity (person)", "get_entity", { type: "person", id: person.id });
  await ok("get_entity (problem)", "get_entity", { type: "problem", id: "signing" });

  await ok("get_funding_breakdown via get_funding", "get_funding", { scope: "initiative", initiative: first.slug }, (d) => (d.funding?.goalCents === first.goalCents ? null : "goal differs from list"));
  const backers = await ok("get_backers via get_funding", "get_funding", { scope: "backers", limit: 3 }, (d) => (d.items.length <= 3 ? null : "limit ignored"));
  await ok("analyze_funding_relationships via get_funding", "get_funding", { scope: "relationships" }, (d) => (Array.isArray(d.selfPledges) ? null : "selfPledges missing"));
  const backerId = backers?.items?.[0]?.backerId as string | undefined;
  if (backerId) await ok("get_backers via get_entity (organization pledges)", "get_entity", { type: "organization", id: backerId }, (d) => (Array.isArray(d.pledges) ? null : "pledges missing"));

  const claim = dossier?.claims?.[0] as Json | undefined;
  if (claim) {
    await ok("get_claim", "get_claim", { claimId: claim.id }, (d) => (d.claim?.id === claim.id && d.impact === undefined ? null : "claim mismatch"));
    await ok("trace_claim via get_claim", "get_claim", { claimId: claim.id, trace: true }, (d) => (Array.isArray(d.impact?.metrics) ? null : "impact missing"));
  } else check("discover a claim", false);
  const evidenceId = dossier?.evidence?.[0]?.id as string | undefined;
  if (evidenceId) await ok("get_evidence (by id)", "get_evidence", { evidenceId }, (d) => (d.evidence?.id === evidenceId ? null : "evidence mismatch"));
  await ok("get_evidence (by initiative)", "get_evidence", { initiative: first.id, limit: 5 });

  await ok("get_corrections", "get_corrections", { limit: 10 }, (d) => (typeof d.notice === "string" && Array.isArray(d.items) ? null : "shape"));
  await ok("get_changes", "get_changes", { limit: 5, kinds: ["funding_changed"] }, (d) => (d.items.every((c: Json) => c.kind === "funding_changed") ? null : "kind filter"));
  await ok("get_metrics (cohort)", "get_metrics", {}, (d) => (d.level === "cohort" && d.values["cohort.initiatives"] ? null : "cohort metrics missing"));
  await ok("get_metrics (initiative)", "get_metrics", { initiative: first.slug, includeDefinitions: false }, (d) => (d.level === "initiative" && d.definitions === undefined ? null : "initiative metrics"));
  await ok("compare_initiatives", "compare_initiatives", { ids: [first.slug, second.slug], groups: ["Funding"] }, (d) => (d.rows.every((r: Json) => r.group === "Funding") && d.columns.length === 2 ? null : "group filter"));
  await ok("detect_overlap (published hypotheses)", "detect_overlap", { limit: 5 });
  await ok("detect_overlap (pair signals)", "detect_overlap", { ids: [first.id, second.id] }, (d) => (d.total === 1 ? null : `expected 1 pair, got ${d.total}`));
  await ok("get_dependencies", "get_dependencies", { initiative: first.slug }, (d) => (d.total === 1 ? null : "expected one row"));
  await ok("get_security_coverage", "get_security_coverage", {}, (d) => (d.stages.length === 11 && d.categories.length > 0 ? null : "stages"));
  await ok("find_evidence_gaps", "find_evidence_gaps", { importance: "higher", limit: 5 }, (d) => (d.items.every((b: Json) => b.importance === "higher") ? null : "importance filter"));
  await ok("simulate_portfolio", "simulate_portfolio", { initiativeIds: [first.slug, second.slug], budgetUsd: 50000, pledgeConversion: 0.5 }, (d) => (d.rows.length === 2 && d.totals ? null : "rows"));
  await ok("export_research", "export_research", { ids: [first.slug], parts: ["initiatives", "claims"] }, (d) => (d.initiatives?.length === 1 && d.milestones === undefined ? null : "parts filter"));

  // Predictable errors.
  await bad("unknown initiative is not_found", "get_initiative", { id: "no-such-initiative" }, "not_found");
  await bad("unknown claim is not_found", "get_claim", { claimId: "cl_doesnotexist" }, "not_found");
  await bad("limit above 50 is rejected", "list_initiatives", { limit: 500 });
  await bad("unknown property is rejected", "list_initiatives", { rank: true });
  await bad("invalid cursor is bad_request", "list_initiatives", { cursor: "bm9wZQ" }, "bad_request");
  await bad("missing initiative for funding scope is bad_request", "get_funding", { scope: "initiative" }, "bad_request");
  await bad("unsupported entity type is rejected", "get_entity", { type: "wallet", id: "x" });
  await bad("compare needs two ids", "compare_initiatives", { ids: [first.slug] });
  await bad("export is limited to five initiatives", "export_research", { ids: (all?.items ?? []).slice(0, 6).map((i: Json) => i.slug) });
  await bad("simulate rejects unknown ids", "simulate_portfolio", { initiativeIds: ["no-such-initiative"] }, "not_found");
  await bad("evidence needs exactly one selector", "get_evidence", {}, "bad_request");

  const missing = TOOLS.map((t) => t.name).filter((n) => !calls[n]);
  check("every tool executed", missing.length === 0, missing.length ? `not called: ${missing.join(", ")}` : `${Object.keys(calls).length} tools`);
  return { checks, calls };
}

export function textOf(r: CallToolResult): string {
  const first = r.content?.[0];
  return first && first.type === "text" ? first.text : "";
}
