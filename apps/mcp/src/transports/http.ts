import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpConfig } from "../config.js";
import { buildMcpServer } from "../server.js";

export function isAuthorized(headerValue: string | undefined, expectedToken: string): boolean {
  if (!headerValue) return false;
  const provided = Buffer.from(headerValue);
  const expected = Buffer.from(expectedToken);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

const JSON_RPC_ERROR = (message: string) =>
  JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });

export async function runHttpTransport(cfg: McpConfig): Promise<ReturnType<typeof createServer>> {
  const authToken = cfg.authToken;
  if (!authToken) throw new Error("MCP_AUTH_TOKEN is required for HTTP transport");

  const httpServer = createServer((req, res) => {
    void (async () => {
      if (req.method !== "POST") {
        res.writeHead(405, { "content-type": "application/json" }).end(JSON_RPC_ERROR("Method not allowed."));
        return;
      }

      const authHeader = req.headers["x-mcp-auth"];
      const authValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      if (!isAuthorized(authValue, authToken)) {
        res.writeHead(401, { "content-type": "application/json" }).end(JSON_RPC_ERROR("Unauthorized."));
        return;
      }

      const mcpServer = buildMcpServer("mcp:http");
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

      try {
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);
      } catch {
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" }).end(JSON_RPC_ERROR("Internal server error"));
        }
      } finally {
        res.on("close", () => {
          void transport.close();
          void mcpServer.close();
        });
      }
    })();
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(cfg.port, () => resolve());
  });

  // eslint-disable-next-line no-console
  console.log(`MCP HTTP transport listening on port ${cfg.port}`);

  return httpServer;
}
