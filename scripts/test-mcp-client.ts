/**
 * Standalone smoke test for the MCP server, using the real @modelcontextprotocol/sdk
 * client — the same code path any external MCP client (Claude Desktop, another agent,
 * a CI check) would use. This bypasses MCP Inspector entirely, which is useful because
 * Inspector's own browser-based proxy has known rough edges with custom auth headers on
 * Streamable HTTP transports that are unrelated to whether the server itself is correct.
 *
 * Usage:
 *   MCP_URL=http://localhost:4100 MCP_AUTH_TOKEN=replace-for-http-transport \
 *     npx tsx scripts/test-mcp-client.ts "What is the AppLovin file size limit?"
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main(): Promise<void> {
  const url = process.env.MCP_URL ?? "http://localhost:4100";
  const authToken = process.env.MCP_AUTH_TOKEN;
  const query = process.argv[2] ?? "What is the AppLovin file size limit?";

  if (!authToken) {
    throw new Error("Set MCP_AUTH_TOKEN (see MCP_AUTH_TOKEN in your .env) before running this script.");
  }

  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { "x-mcp-auth": authToken } }
  });

  const client = new Client({ name: "lumen-mcp-smoke-test", version: "0.1.0" });

  console.log(`Connecting to ${url} ...`);
  await client.connect(transport);
  console.log("Connected. Listing tools...");

  const { tools } = await client.listTools();
  console.log(
    "Tools:",
    tools.map((t) => t.name)
  );

  const searchTool = tools.find((t) => t.name === "search_corpus");
  if (!searchTool) {
    throw new Error("search_corpus tool not found in tools/list response.");
  }

  console.log(`\nCalling search_corpus with query: "${query}"`);
  const result = await client.callTool({
    name: "search_corpus",
    arguments: { query }
  });

  console.log("\n--- search_corpus result ---");
  for (const block of result.content as Array<{ type: string; text?: string }>) {
    if (block.type === "text" && block.text) {
      console.log(block.text);
    }
  }

  await client.close();
  console.log("\nOK: MCP server responded correctly over Streamable HTTP with real SDK client.");
}

main().catch((err) => {
  console.error("MCP smoke test failed:", err);
  process.exitCode = 1;
});
