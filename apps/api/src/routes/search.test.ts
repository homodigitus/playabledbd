import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { desc, eq, inArray } from "drizzle-orm";
import { closeDb, getDb, searchLogs, users } from "@lumen/db";
import { createTestServer, createTestUser, loginAs, uniqueKey, type TestUser } from "../test-utils/db.js";

const mockRetrieve = vi.fn();
const mockToSearchResult = vi.fn();
const mockLoadRagConfig = vi.fn((..._args: unknown[]) => ({ retrievalMode: "hybrid" }));

vi.mock("@lumen/rag", () => ({
  retrieve: (...args: unknown[]) => mockRetrieve(...args),
  toSearchResult: (...args: unknown[]) => mockToSearchResult(...args),
  loadRagConfig: (...args: unknown[]) => mockLoadRagConfig(...args)
}));

describe("POST /api/search", () => {
  let app: FastifyInstance;
  const createdUserIds: string[] = [];
  let user: TestUser;
  let cookie: string;

  beforeAll(async () => {
    app = await createTestServer();
    user = await createTestUser({ role: "USER" });
    createdUserIds.push(user.id);
    cookie = await loginAs(app, user.email, user.password);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(searchLogs).where(eq(searchLogs.userId, user.id));
    await db.delete(users).where(inArray(users.id, createdUserIds));
    await app.close();
    await closeDb();
  });

  it("requires auth: 401 without a session cookie", async () => {
    const res = await app.inject({ method: "POST", url: "/api/search", payload: { query: "hello world" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 400 VALIDATION_ERROR for a too-short query", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/search",
      headers: { cookie },
      payload: { query: "a" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it("returns mapped mocked results and logs a real search_logs row", async () => {
    const query = `${uniqueKey("search-query")} what is the refund policy`;
    const rawResult = {
      chunkId: "11111111-1111-1111-1111-111111111111",
      documentId: "22222222-2222-2222-2222-222222222222",
      documentTitle: "Refund Policy",
      sourceKey: "docs/refunds.md",
      snippet: "Refunds are processed within 14 days.",
      score: 0.87,
      rank: 1
    };
    mockRetrieve.mockResolvedValueOnce([rawResult]);
    mockToSearchResult.mockImplementation((r: typeof rawResult) => ({ ...r }));

    const res = await app.inject({
      method: "POST",
      url: "/api/search",
      headers: { cookie },
      payload: { query, topK: 3, mode: "vector" }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resultCount).toBe(1);
    expect(body.results).toEqual([rawResult]);
    expect(typeof body.requestId).toBe("string");
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);

    expect(mockRetrieve).toHaveBeenCalledWith({ query, topK: 3, mode: "vector" });

    const db = getDb();
    const rows = await db
      .select()
      .from(searchLogs)
      .where(eq(searchLogs.userId, user.id))
      .orderBy(desc(searchLogs.createdAt))
      .limit(1);
    expect(rows[0]).toMatchObject({
      query,
      retrievalMode: "vector",
      resultCount: 1,
      answerStatus: "ANSWERED",
      topScore: 0.87
    });
  });

  it("logs INSUFFICIENT_CONTEXT and falls back to the configured retrieval mode when no results and no mode given", async () => {
    const query = `${uniqueKey("empty-query")} nothing matches this at all`;
    mockRetrieve.mockResolvedValueOnce([]);
    mockToSearchResult.mockImplementation((r: unknown) => r);

    const res = await app.inject({
      method: "POST",
      url: "/api/search",
      headers: { cookie },
      payload: { query }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resultCount).toBe(0);
    expect(body.results).toEqual([]);

    const db = getDb();
    const rows = await db
      .select()
      .from(searchLogs)
      .where(eq(searchLogs.userId, user.id))
      .orderBy(desc(searchLogs.createdAt))
      .limit(1);
    expect(rows[0]).toMatchObject({
      query,
      retrievalMode: "hybrid",
      resultCount: 0,
      answerStatus: "INSUFFICIENT_CONTEXT",
      topScore: null
    });
  });
});
