/**
 * MCP server through a real SDK client over a linked in-memory transport, against the published
 * dataset (FileStore, MONGODB_URI unset) and a temporary corrections file.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Correction, Dataset } from "@/lib/domain/schemas";
import { MCP_MAX_ITEMS, REQUESTED_CAPABILITIES, TOOLS } from "@/lib/mcp/catalog";

type G = { __esiStore?: unknown; __esiMongoFailedAt?: number };
const g = globalThis as unknown as G;

let client: Client;
let d: Dataset;
let stateDir: string;
const PRIVATE_CONTACT = "private-mcp-reviewer@example.org";
const PRIVATE_NOTE = "internal moderator note that must stay private";

const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as CallToolResult;
const text = (r: CallToolResult) => (r.content?.[0]?.type === "text" ? r.content[0].text : "");
const data = (r: CallToolResult) => (r.structuredContent as { data: any }).data;

beforeAll(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "esi-mcp-"));
  process.env.ESI_LOCAL_STATE_DIR = stateDir;
  process.env.MONGODB_URI = "";
  delete g.__esiStore;
  delete g.__esiMongoFailedAt;
  d = await (await import("@/lib/db/file-store")).loadPublishedDataset();

  // One accepted correction with private fields, to prove they never reach MCP output.
  const claim = d.claims[0]!;
  const now = new Date().toISOString();
  const correction: Correction = {
    id: "corr_mcp_test",
    targetType: "claim",
    targetId: claim.id,
    initiativeId: claim.initiativeId,
    category: "incorrect",
    proposedCorrection: "Public proposed correction text",
    evidenceUrl: "https://example.org/evidence",
    explanation: "Because",
    attribution: null,
    contactCiphertext: `cipher:${PRIVATE_CONTACT}`,
    submitterKey: "hmac-key-private",
    state: "accepted",
    submittedAt: now,
    updatedAt: now,
    resolution: "Accepted after review",
    appliedChange: null,
    history: [
      { at: now, state: "submitted", note: null },
      { at: now, state: "accepted", note: PRIVATE_NOTE },
    ],
  };
  await fs.writeFile(path.join(stateDir, "corrections.json"), JSON.stringify([correction]));

  const { createServer } = await import("@/mcp/server");
  const server = await createServer();
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "vitest", version: "1.0.0" });
  await client.connect(b);
});

afterAll(async () => {
  await client?.close();
  await fs.rm(stateDir, { recursive: true, force: true });
});

describe("MCP initialize and discovery", () => {
  it("initializes with server info and instructions", () => {
    expect(client.getServerVersion()?.name).toBe("ethsecurity-intelligence");
    const instructions = client.getInstructions() ?? "";
    expect(instructions).toContain(`${d.meta.cohort.size} initiatives in TheDAO Security Fund ballot cohort`);
    expect(instructions).toMatch(/untrusted source content/);
    expect(instructions).toMatch(/Decisions remain with the reviewer/);
    expect(instructions).toMatch(/Proof of Audits/);
    expect(client.getServerCapabilities()?.tools).toBeDefined();
  });

  it("lists exactly the catalog tools, all read-only and strict", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS.map((t) => t.name).sort());
    for (const t of tools) {
      expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
      expect(t.inputSchema.type).toBe("object");
      expect((t.inputSchema as Record<string, unknown>).additionalProperties).toBe(false);
      expect(t.outputSchema?.type).toBe("object");
      expect(t.description?.length ?? 0).toBeLessThan(500);
    }
  });

  it("maps every requested capability to a registered tool", () => {
    const covered = new Set(TOOLS.flatMap((t) => t.covers.map((c) => c.name)));
    for (const name of REQUESTED_CAPABILITIES) expect(covered.has(name), name).toBe(true);
  });
});

describe("Streamable HTTP route /api/mcp", () => {
  const post = async (body: unknown) => {
    const route = await import("@/app/api/mcp/route");
    return route.POST(new Request("http://localhost/api/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify(body) }));
  };

  it("answers initialize and tools/list statelessly", async () => {
    const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } });
    expect(init.status).toBe(200);
    expect(init.headers.get("access-control-allow-origin")).toBe("*");
    const j = (await init.json()) as { result: { serverInfo: { name: string }; instructions: string } };
    expect(j.result.serverInfo.name).toBe("ethsecurity-intelligence");
    const list = (await (await post({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json()) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name).sort()).toEqual(TOOLS.map((t) => t.name).sort());
    const call = (await (await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_metrics", arguments: {} } })).json()) as { result: { structuredContent: { meta: { datasetVersion: string } } } };
    expect(call.result.structuredContent.meta.datasetVersion).toBe(d.meta.datasetVersion);
  });

  it("rejects GET and DELETE with 405 and handles CORS preflight", async () => {
    const route = await import("@/app/api/mcp/route");
    expect(route.GET().status).toBe(405);
    expect(route.DELETE().status).toBe(405);
    expect(route.OPTIONS().status).toBe(204);
  });
});

describe("MCP tool execution", () => {
  it("runs the full smoke suite: every tool, valid and invalid input", async () => {
    const { runSmoke } = await import("@/mcp/smoke");
    const { checks, calls } = await runSmoke(client);
    const failed = checks.filter((c) => !c.ok);
    expect(failed).toEqual([]);
    for (const t of TOOLS) expect(calls[t.name], t.name).toBeGreaterThan(0);
  });

  it("paginates the whole cohort with cursors and no duplicates", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const r = await call("list_initiatives", { limit: 7, ...(cursor ? { cursor } : {}) });
      expect(r.isError).toBeFalsy();
      const page = data(r);
      expect(page.items.length).toBeLessThanOrEqual(7);
      seen.push(...page.items.map((i: { id: string }) => i.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen.length).toBe(d.initiatives.length);
    expect(new Set(seen).size).toBe(seen.length);
    const titles = d.initiatives.map((i) => i.title.toLowerCase()).sort();
    const listed = seen.map((id) => d.initiatives.find((i) => i.id === id)!.title.toLowerCase());
    expect(listed).toEqual(titles);
  });

  it("caps page size at the documented maximum", async () => {
    const r = await call("list_initiatives", { limit: MCP_MAX_ITEMS });
    expect(data(r).items.length).toBe(MCP_MAX_ITEMS);
    expect(data(r).nextCursor).not.toBeNull();
  });

  it("returns official figures unchanged", async () => {
    for (const ini of d.initiatives.slice(0, 10)) {
      const r = data(await call("get_funding", { scope: "initiative", initiative: ini.slug }));
      expect(r.funding).toEqual(ini.funding);
      expect(r.pledges.length).toBe(d.pledges.filter((p) => p.initiativeId === ini.id).length);
    }
  });

  it("keeps every dossier with all sections within the result limit", async () => {
    const sections = ["overview", "proposal", "milestones", "funding", "claims", "evidence", "team", "technical", "reality", "related", "blind_spots", "changes", "revisions", "metrics", "research_jobs"];
    for (const ini of d.initiatives) {
      const r = await call("get_initiative", { id: ini.id, sections });
      expect(r.isError, `${ini.slug}: ${text(r).slice(0, 120)}`).toBeFalsy();
      expect(data(r).milestones.length).toBe(d.milestones.filter((m) => m.initiativeId === ini.id).length);
    }
  });

  it("publishes accepted corrections without private contact, submitter key or moderator notes", async () => {
    const claim = d.claims[0]!;
    const results = [await call("get_corrections", {}), await call("get_claim", { claimId: claim.id, trace: true }), await call("get_corrections", { targetId: claim.id })];
    for (const r of results) {
      expect(r.isError).toBeFalsy();
      const body = text(r);
      expect(body).not.toContain(PRIVATE_CONTACT);
      expect(body).not.toContain("hmac-key-private");
      expect(body).not.toContain(PRIVATE_NOTE);
      expect(body).not.toContain("contactCiphertext");
      expect(body).not.toContain("submitterKey");
    }
    const list = data(results[0]!);
    expect(list.items.map((c: { id: string }) => c.id)).toContain("corr_mcp_test");
    expect(data(results[1]!).corrections[0].proposedCorrection).toBe("Public proposed correction text");
  });

  it("returns predictable errors", async () => {
    const r = await call("get_entity", { type: "organization", id: "org_does-not-exist" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(text(r))).toEqual({ error: { code: "not_found", message: expect.stringContaining("org_does-not-exist") } });
    const unknownTool = (await client.callTool({ name: "run_query", arguments: {} })) as CallToolResult;
    expect(unknownTool.isError).toBe(true);
    expect(text(unknownTool)).toMatch(/not found/);
  });

  it("simulate_portfolio gives the same result as the shared service", async () => {
    const { simulatePortfolio } = await import("@/lib/intelligence/service");
    const input = { initiativeIds: d.initiatives.slice(0, 3).map((i) => i.id), budgetUsd: 100000, pledgeConversion: 0.5 };
    expect(data(await call("simulate_portfolio", input))).toEqual(JSON.parse(JSON.stringify(simulatePortfolio(d, input))));
  });
});
