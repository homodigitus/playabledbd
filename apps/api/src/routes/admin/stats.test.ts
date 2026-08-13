import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray } from "drizzle-orm";
import { closeDb, documents, getDb, ingestionRuns, searchLogs, users } from "@lumen/db";
import { createTestServer, createTestUser, loginAs, uniqueKey, type TestUser } from "../../test-utils/db.js";

describe("admin stats routes", () => {
  let app: FastifyInstance;
  const createdUserIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdSearchLogIds: string[] = [];
  let admin: TestUser;
  let plainUser: TestUser;
  let adminCookie: string;
  let userCookie: string;

  beforeAll(async () => {
    app = await createTestServer();
    admin = await createTestUser({ role: "ADMIN" });
    plainUser = await createTestUser({ role: "USER" });
    createdUserIds.push(admin.id, plainUser.id);
    adminCookie = await loginAs(app, admin.email, admin.password);
    userCookie = await loginAs(app, plainUser.email, plainUser.password);
  });

  afterAll(async () => {
    const db = getDb();
    if (createdSearchLogIds.length > 0) {
      await db.delete(searchLogs).where(inArray(searchLogs.id, createdSearchLogIds));
    }
    if (createdRunIds.length > 0) {
      await db.delete(ingestionRuns).where(inArray(ingestionRuns.id, createdRunIds));
    }
    if (createdDocumentIds.length > 0) {
      await db.delete(documents).where(inArray(documents.id, createdDocumentIds));
    }
    await db.delete(users).where(inArray(users.id, createdUserIds));
    await app.close();
    await closeDb();
  });

  describe("GET /api/admin/stats/overview", () => {
    it("requires admin: 401 with no session, 403 for a plain user", async () => {
      const noSession = await app.inject({ method: "GET", url: "/api/admin/stats/overview" });
      expect(noSession.statusCode).toBe(401);

      const asUser = await app.inject({
        method: "GET",
        url: "/api/admin/stats/overview",
        headers: { cookie: userCookie }
      });
      expect(asUser.statusCode).toBe(403);
    });

    it("reflects seeded documents/ingestion/search-log rows in its counts and shape", async () => {
      const db = getDb();

      const statuses = ["PENDING", "PROCESSING", "INDEXED", "FAILED", "REMOVED"] as const;
      for (const status of statuses) {
        const [doc] = await db
          .insert(documents)
          .values({
            sourceKey: uniqueKey(`stats-${status}`),
            title: `Stats ${status} Doc`,
            fileName: "stats.md",
            mimeType: "text/markdown",
            sizeBytes: 10,
            contentSha256: "d".repeat(64),
            status
          })
          .returning({ id: documents.id });
        createdDocumentIds.push(doc!.id);
      }

      const [run] = await db
        .insert(ingestionRuns)
        .values({
          status: "SUCCEEDED",
          triggeredByUserId: admin.id,
          sourcePath: "/corpus",
          startedAt: new Date(),
          finishedAt: new Date(),
          documentsSeen: 1,
          documentsIndexed: 1,
          documentsSkipped: 0,
          documentsFailed: 0,
          chunksCreated: 1
        })
        .returning({ id: ingestionRuns.id });
      createdRunIds.push(run!.id);

      const [recentLog] = await db
        .insert(searchLogs)
        .values({
          userId: plainUser.id,
          principal: plainUser.email,
          query: uniqueKey("recent-query"),
          retrievalMode: "hybrid",
          topK: 5,
          latencyMs: 42,
          resultCount: 3,
          topScore: 0.9,
          answerStatus: "ANSWERED",
          createdAt: new Date()
        })
        .returning({ id: searchLogs.id });
      createdSearchLogIds.push(recentLog!.id);

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/stats/overview",
        headers: { cookie: adminCookie }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      expect(body.documents.pending).toBeGreaterThanOrEqual(2); // PENDING + PROCESSING both count
      expect(body.documents.indexed).toBeGreaterThanOrEqual(1);
      expect(body.documents.failed).toBeGreaterThanOrEqual(1);
      expect(body.documents.removed).toBeGreaterThanOrEqual(1);
      expect(body.documents.total).toBeGreaterThanOrEqual(5);

      expect(body.chunks.total).toBeGreaterThanOrEqual(0);

      expect(body.lastIngestion).not.toBeNull();
      expect(typeof body.lastIngestion.id).toBe("string");
      expect(typeof body.lastIngestion.status).toBe("string");

      expect(body.search.last24h).toBeGreaterThanOrEqual(1);
      expect(body.search.last7d).toBeGreaterThanOrEqual(1);
      expect(body.search.avgLatencyMs).toBeGreaterThanOrEqual(0);
      expect(body.search.p95LatencyMs).toBeGreaterThanOrEqual(0);
      expect(body.search.avgResultCount).toBeGreaterThanOrEqual(0);
      expect(body.search.insufficientContextRate).toBeGreaterThanOrEqual(0);
      expect(body.search.insufficientContextRate).toBeLessThanOrEqual(1);

      expect(body.readiness).toEqual({ databaseOk: true, pgvectorOk: true });
    });

    it("a search log older than 7 days does not inflate last24h/last7d relative to its own insertion", async () => {
      const db = getDb();
      const before = await app.inject({
        method: "GET",
        url: "/api/admin/stats/overview",
        headers: { cookie: adminCookie }
      });
      const beforeBody = before.json();

      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const [oldLog] = await db
        .insert(searchLogs)
        .values({
          userId: plainUser.id,
          principal: plainUser.email,
          query: uniqueKey("old-query"),
          retrievalMode: "vector",
          topK: 5,
          latencyMs: 10,
          resultCount: 0,
          topScore: null,
          answerStatus: "INSUFFICIENT_CONTEXT",
          createdAt: tenDaysAgo
        })
        .returning({ id: searchLogs.id });
      createdSearchLogIds.push(oldLog!.id);

      const after = await app.inject({
        method: "GET",
        url: "/api/admin/stats/overview",
        headers: { cookie: adminCookie }
      });
      const afterBody = after.json();

      expect(afterBody.search.last7d).toBe(beforeBody.search.last7d);
      expect(afterBody.search.last24h).toBe(beforeBody.search.last24h);
    });
  });

  describe("GET /api/admin/stats/recent-searches", () => {
    it("requires admin", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/stats/recent-searches",
        headers: { cookie: userCookie }
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns recent searches, most recent first, truncating a long query to 200 chars + ellipsis", async () => {
      const db = getDb();
      const longQuery = `${uniqueKey("long")}-${"q".repeat(250)}`;

      const [log] = await db
        .insert(searchLogs)
        .values({
          userId: plainUser.id,
          principal: plainUser.email,
          query: longQuery,
          retrievalMode: "hybrid",
          topK: 5,
          latencyMs: 5,
          resultCount: 1,
          topScore: 0.5,
          answerStatus: "ANSWERED",
          createdAt: new Date()
        })
        .returning({ id: searchLogs.id });
      createdSearchLogIds.push(log!.id);

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/stats/recent-searches",
        headers: { cookie: adminCookie }
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const found = body.searches.find((s: { id: string }) => s.id === log!.id);
      expect(found).toBeTruthy();
      expect(found.query).toHaveLength(203);
      expect(found.query.endsWith("...")).toBe(true);

      if (body.searches.length > 1) {
        const first = new Date(body.searches[0].createdAt).getTime();
        const second = new Date(body.searches[1].createdAt).getTime();
        expect(first).toBeGreaterThanOrEqual(second);
      }
    });
  });
});
