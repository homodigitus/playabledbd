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

// Browser-based MCP clients (e.g. MCP Inspector) send a CORS preflight OPTIONS request before
// any POST that carries a custom header like x-mcp-auth. Without these headers the browser
// blocks the real request before it's ever sent, which looks like the server hanging even
// though non-browser clients (curl, server-side SDKs) are unaffected.
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-mcp-auth, mcp-session-id, mcp-protocol-version",
  "access-control-expose-headers": "mcp-session-id"
};

export async function runHttpTransport(cfg: McpConfig): Promise<ReturnType<typeof createServer>> {
  const authToken = cfg.authToken;
  if (!authToken) throw new Error("MCP_AUTH_TOKEN is required for HTTP transport");

  const httpServer = createServer((req, res) => {
    void (async () => {
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        res.setHeader(key, value);
      }

      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }

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
