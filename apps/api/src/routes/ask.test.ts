import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { desc, eq, inArray } from "drizzle-orm";
import { closeDb, getDb, searchLogs, users } from "@lumen/db";
import { createTestServer, createTestUser, loginAs, uniqueKey, type TestUser } from "../test-utils/db.js";

const mockAnswerQuestion = vi.fn();
const mockLoadRagConfig = vi.fn((..._args: unknown[]) => ({ retrievalMode: "hybrid" }));

vi.mock("@lumen/rag", () => ({
  answerQuestion: (...args: unknown[]) => mockAnswerQuestion(...args),
  loadRagConfig: (...args: unknown[]) => mockLoadRagConfig(...args),
  // The global error handler imports this class to special-case ingestion conflicts; it must exist
  // on the mocked module (even unused here) or vitest's mock-safety check throws on any non-ApiError.
  IngestionConflictError: class IngestionConflictError extends Error {}
}));

describe("POST /api/ask", () => {
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
    const res = await app.inject({ method: "POST", url: "/api/ask", payload: { query: "hello world" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 400 VALIDATION_ERROR for a too-short query", async () => {
    const res = await app.inject({ method: "POST", url: "/api/ask", headers: { cookie }, payload: { query: "a" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    expect(mockAnswerQuestion).not.toHaveBeenCalled();
  });

  it("happy path: returns the mocked answer/citations/status and logs ANSWERED", async () => {
    const query = `${uniqueKey("ask-query")} how do interactive ads track engagement`;
    const mockResult = {
      answer: "Interactive ads track engagement via the SDK's event pipeline [1].",
      status: "answered" as const,
      citations: [
        {
          id: 1,
          documentId: "22222222-2222-2222-2222-222222222222",
          documentTitle: "SDK Overview",
          sourceKey: "docs/sdk.md",
          chunkId: "11111111-1111-1111-1111-111111111111",
          quote: "The event pipeline records engagement."
        }
      ],
      results: [
        {
          chunkId: "11111111-1111-1111-1111-111111111111",
          documentId: "22222222-2222-2222-2222-222222222222",
          documentTitle: "SDK Overview",
          sourceKey: "docs/sdk.md",
          snippet: "The event pipeline records engagement.",
          score: 0.91,
          rank: 1
        }
      ]
    };
    mockAnswerQuestion.mockResolvedValueOnce(mockResult);

    const res = await app.inject({
      method: "POST",
      url: "/api/ask",
      headers: { cookie },
      payload: { query, topK: 4, mode: "hybrid" }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.answer).toBe(mockResult.answer);
    expect(body.status).toBe("answered");
    expect(body.citations).toEqual(mockResult.citations);
    expect(body.results).toEqual(mockResult.results);
    expect(typeof body.requestId).toBe("string");
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);

    expect(mockAnswerQuestion).toHaveBeenCalledWith(query, { topK: 4, mode: "hybrid" });

    const db = getDb();
    const rows = await db
      .select()
      .from(searchLogs)
      .where(eq(searchLogs.userId, user.id))
      .orderBy(desc(searchLogs.createdAt))
      .limit(1);
    expect(rows[0]).toMatchObject({ query, answerStatus: "ANSWERED", resultCount: 1, topScore: 0.91 });
  });

  it("logs INSUFFICIENT_CONTEXT when the mocked answer has that status", async () => {
    const query = `${uniqueKey("insufficient-query")} something totally unrelated`;
    mockAnswerQuestion.mockResolvedValueOnce({
      answer: "I don't have enough information to answer that.",
      status: "insufficient_context",
      citations: [],
      results: []
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/ask",
      headers: { cookie },
      payload: { query }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("insufficient_context");

    const db = getDb();
    const rows = await db
      .select()
      .from(searchLogs)
      .where(eq(searchLogs.userId, user.id))
      .orderBy(desc(searchLogs.createdAt))
      .limit(1);
    expect(rows[0]).toMatchObject({ query, answerStatus: "INSUFFICIENT_CONTEXT", resultCount: 0, topScore: null });
  });

  it("error path: logs answerStatus ERROR and still propagates a 500 when answerQuestion rejects", async () => {
    const query = `${uniqueKey("error-query")} this will blow up downstream`;
    mockAnswerQuestion.mockRejectedValueOnce(new Error("openai unavailable"));

    const res = await app.inject({
      method: "POST",
      url: "/api/ask",
      headers: { cookie },
      payload: { query }
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe("INTERNAL_ERROR");

    const db = getDb();
    const rows = await db
      .select()
      .from(searchLogs)
      .where(eq(searchLogs.userId, user.id))
      .orderBy(desc(searchLogs.createdAt))
      .limit(1);
    expect(rows[0]).toMatchObject({ query, answerStatus: "ERROR", resultCount: 0, topScore: null });
  });
});
