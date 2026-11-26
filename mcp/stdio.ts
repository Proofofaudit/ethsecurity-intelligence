/**
 * Local MCP server over stdio: `npm run mcp` (or `npm run --silent --prefix <repo> mcp` from an
 * MCP client). stdout carries only MCP messages; logs go to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";

const server = await createServer();
await server.connect(new StdioServerTransport());
console.error("[mcp] ETHSecurity Intelligence MCP server ready on stdio (read-only).");

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
