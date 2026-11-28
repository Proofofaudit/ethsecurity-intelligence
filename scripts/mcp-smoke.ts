/**
 * MCP smoke test with the official SDK client.
 *   npm run mcp:smoke                         spawns the stdio server (tsx mcp/stdio.ts)
 *   npm run mcp:smoke -- --url <base>/api/mcp  connects to a running Streamable HTTP endpoint
 * Initializes a session, lists tools, calls every tool with valid and invalid input and exits
 * non-zero if any check fails.
 */
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { runSmoke } from "@/mcp/smoke";

const urlArg = process.argv.indexOf("--url");
const url = urlArg >= 0 ? process.argv[urlArg + 1] : undefined;

let transport: Transport;
let label: string;
if (url) {
  transport = new StreamableHTTPClientTransport(new URL(url));
  label = `Streamable HTTP ${url}`;
} else {
  const root = path.resolve(import.meta.dirname, "..");
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "mcp", "stdio.ts")],
    cwd: root,
    // Only the variables the server reads; MONGODB_URI is passed through as set (empty means file dataset).
    env: { ...getDefaultEnvironment(), MONGODB_URI: process.env.MONGODB_URI ?? "", MONGODB_DB: process.env.MONGODB_DB ?? "ethsecurity_intelligence" },
    stderr: "inherit",
  });
  label = "stdio (tsx mcp/stdio.ts)";
}

const client = new Client({ name: "ethsecurity-mcp-smoke", version: "1.0.0" });
const started = Date.now();
let failed = 0;
try {
  await client.connect(transport);
  console.log(`Connected over ${label}; protocol initialized.`);
  const { checks, calls } = await runSmoke(client);
  for (const c of checks) {
    if (!c.ok) failed++;
    console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  (${c.detail})` : ""}`);
  }
  const total = Object.values(calls).reduce((a, b) => a + b, 0);
  console.log(`\n${checks.length - failed}/${checks.length} checks passed; ${total} tool calls across ${Object.keys(calls).length} tools in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
} catch (err) {
  failed++;
  console.error("MCP smoke test could not run:", err instanceof Error ? err.message : String(err));
} finally {
  await client.close().catch(() => undefined);
}
process.exit(failed ? 1 : 0);
