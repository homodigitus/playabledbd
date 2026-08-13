import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildMcpServer } from "../server.js";

export async function runStdioTransport(): Promise<void> {
  const server = buildMcpServer("mcp:stdio");
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
