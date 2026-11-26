import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "@/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Request bodies are small JSON-RPC messages; anything larger is rejected with 413 by the transport. */
const MAX_BODY_BYTES = 65_536;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

/**
 * Remote MCP endpoint (Streamable HTTP, stateless). Each POST gets a fresh read-only server and
 * transport, so no session state is kept. The data is public, so any origin may call it.
 */
async function handle(req: Request): Promise<Response> {
  let res: Response;
  try {
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: MAX_BODY_BYTES });
    const server = await createServer();
    await server.connect(transport);
    res = await transport.handleRequest(req);
    // JSON responses are complete at this point, so the per-request server can be released.
    await server.close();
  } catch (err) {
    console.error("[mcp] request failed:", err instanceof Error ? err.message : String(err));
    res = Response.json({ jsonrpc: "2.0", error: { code: -32603, message: "The research dataset is temporarily unavailable." }, id: null }, { status: 503 });
  }
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  headers.set("Cache-Control", "no-store");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** Stateless server: no server-initiated SSE stream and no session to delete, so GET and DELETE answer 405 as the specification allows. */
function methodNotAllowed(): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. This stateless MCP endpoint accepts POST only." }, id: null },
    { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS", "Cache-Control": "no-store" } },
  );
}

export const POST = handle;
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
}
