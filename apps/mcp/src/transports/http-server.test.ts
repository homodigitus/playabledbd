import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { runHttpTransport } from "./http.js";

function portOf(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected server to be listening on a TCP port");
  }
  return address.port;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

const AUTH_TOKEN = "test-only-mcp-http-transport-token";
const INITIALIZE_BODY = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "vitest-client", version: "0.0.0" }
  }
};

describe("runHttpTransport", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await closeServer(server);
      server = undefined;
    }
  });

  it("rejects non-POST methods with 405", async () => {
    server = await runHttpTransport({ transport: "http", port: 0, authToken: AUTH_TOKEN });
    const port = portOf(server);

    const res = await fetch(`http://127.0.0.1:${port}/`, { method: "GET" });
    expect(res.status).toBe(405);
  });

  it("rejects a request with no x-mcp-auth header with 401", async () => {
    server = await runHttpTransport({ transport: "http", port: 0, authToken: AUTH_TOKEN });
    const port = portOf(server);

    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(INITIALIZE_BODY)
    });
    expect(res.status).toBe(401);
  });

  it("rejects a request with the wrong x-mcp-auth token with 401", async () => {
    server = await runHttpTransport({ transport: "http", port: 0, authToken: AUTH_TOKEN });
    const port = portOf(server);

    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mcp-auth": "wrong-token" },
      body: JSON.stringify(INITIALIZE_BODY)
    });
    expect(res.status).toBe(401);
  });

  it("accepts a correctly authenticated initialize request and returns a JSON-RPC result", async () => {
    server = await runHttpTransport({ transport: "http", port: 0, authToken: AUTH_TOKEN });
    const port = portOf(server);

    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "x-mcp-auth": AUTH_TOKEN
      },
      body: JSON.stringify(INITIALIZE_BODY)
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    const dataLine = body.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) throw new Error(`expected an SSE "data:" line in response body, got: ${body}`);
    const payload = JSON.parse(dataLine.slice("data: ".length)) as {
      jsonrpc: string;
      id: number;
      result?: { serverInfo?: { name: string } };
    };
    expect(payload.jsonrpc).toBe("2.0");
    expect(payload.id).toBe(1);
    expect(payload.result?.serverInfo?.name).toBe("lumen-playables-rag");
  });
});
