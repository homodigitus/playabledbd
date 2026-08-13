import { afterEach, describe, expect, it } from "vitest";
import { loadMcpConfig, resetMcpConfigCacheForTests } from "./config.js";

describe("loadMcpConfig", () => {
  afterEach(() => {
    resetMcpConfigCacheForTests();
  });

  it("defaults to stdio transport on port 4100 when env is empty", () => {
    const cfg = loadMcpConfig({});
    expect(cfg.transport).toBe("stdio");
    expect(cfg.port).toBe(4100);
    expect(cfg.authToken).toBeUndefined();
  });

  it("reads an explicit stdio transport with no auth token required", () => {
    const cfg = loadMcpConfig({ MCP_TRANSPORT: "stdio" });
    expect(cfg.transport).toBe("stdio");
  });

  it("coerces MCP_PORT from a string env var to a number", () => {
    const cfg = loadMcpConfig({ MCP_PORT: "5555" });
    expect(cfg.port).toBe(5555);
  });

  it("requires MCP_AUTH_TOKEN when transport is http", () => {
    expect(() => loadMcpConfig({ MCP_TRANSPORT: "http" })).toThrow(/MCP_AUTH_TOKEN is required/);
  });

  it("accepts http transport when MCP_AUTH_TOKEN is set", () => {
    const cfg = loadMcpConfig({ MCP_TRANSPORT: "http", MCP_AUTH_TOKEN: "secret-token-value" });
    expect(cfg.transport).toBe("http");
    expect(cfg.authToken).toBe("secret-token-value");
  });

  it("rejects an unknown transport value", () => {
    expect(() => loadMcpConfig({ MCP_TRANSPORT: "carrier-pigeon" })).toThrow(/Invalid MCP configuration/);
  });

  it("rejects a non-positive port", () => {
    expect(() => loadMcpConfig({ MCP_PORT: "0" })).toThrow(/Invalid MCP configuration/);
    expect(() => loadMcpConfig({ MCP_PORT: "-1" })).toThrow(/Invalid MCP configuration/);
  });

  it("caches the config across calls until reset", () => {
    const first = loadMcpConfig({ MCP_PORT: "4200" });
    const second = loadMcpConfig({ MCP_PORT: "9999" });
    expect(second).toBe(first);
    expect(second.port).toBe(4200);

    resetMcpConfigCacheForTests();
    const third = loadMcpConfig({ MCP_PORT: "9999" });
    expect(third.port).toBe(9999);
  });
});
