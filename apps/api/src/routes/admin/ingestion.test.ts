import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray } from "drizzle-orm";
import { closeDb, getDb, ingestionItems, ingestionRuns, users } from "@lumen/db";
import { createTestServer, createTestUser, loginAs, uniqueKey, type TestUser } from "../../test-utils/db.js";

const mockRunIngestion = vi.fn();

vi.mock("@lumen/rag", () => ({
  runIngestion: (...args: unknown[]) => mockRunIngestion(...args)
}));

describe("admin ingestion routes", () => {
  let app: FastifyInstance;
  const createdUserIds: string[] = [];
  const createdRunIds: string[] = [];
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
    if (createdRunIds.length > 0) {
      await db.delete(ingestionItems).where(inArray(ingestionItems.runId, createdRunIds));
      await db.delete(ingestionRuns).where(inArray(ingestionRuns.id, createdRunIds));
    }
    await db.delete(users).where(inArray(users.id, createdUserIds));
    await app.close();
    await closeDb();
  });

  describe("POST /api/admin/ingestion", () => {
    it("requires admin: 401 with no session, 403 for a plain user", async () => {
      const noSession = await app.inject({ method: "POST", url: "/api/admin/ingestion" });
      expect(noSession.statusCode).toBe(401);

      const asUser = await app.inject({
        method: "POST",
        url: "/api/admin/ingestion",
        headers: { cookie: userCookie }
      });
      expect(asUser.statusCode).toBe(403);
    });

    it("rejects a body with sourcePath set (only the CLI may configure it)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/ingestion",
        headers: { cookie: adminCookie },
        payload: { sourcePath: "/some/path" }
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("SOURCE_PATH_NOT_CONFIGURABLE");
      expect(mockRunIngestion).not.toHaveBeenCalled();
    });

    it("triggers ingestion and returns the resulting run dto", async () => {
      const db = getDb();
      const [run] = await db
        .insert(ingestionRuns)
        .values({
          status: "SUCCEEDED",
          triggeredByUserId: admin.id,
          sourcePath: "/corpus",
          startedAt: new Date(),
          finishedAt: new Date(),
          documentsSeen: 3,
          documentsIndexed: 3,
          documentsSkipped: 0,
          documentsFailed: 0,
          chunksCreated: 12
        })
        .returning({ id: ingestionRuns.id });
      const runId = run!.id;
      createdRunIds.push(runId);

      mockRunIngestion.mockResolvedValueOnce({ runId });

      const res = await app.inject({
        method: "POST",
        url: "/api/admin/ingestion",
        headers: { cookie: adminCookie },
        payload: {}
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.run).toMatchObject({
        id: runId,
        status: "SUCCEEDED",
        documentsIndexed: 3,
        chunksCreated: 12
      });
      expect(mockRunIngestion).toHaveBeenCalledWith({ triggeredByUserId: admin.id });
    });
  });

  describe("GET /api/admin/ingestion", () => {
    it("requires admin", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/ingestion",
        headers: { cookie: userCookie }
      });
      expect(res.statusCode).toBe(403);
    });

    it("lists ingestion runs, most recent first", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/ingestion",
        headers: { cookie: adminCookie }
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.runs)).toBe(true);
      expect(body.runs.some((r: { id: string }) => createdRunIds.includes(r.id))).toBe(true);
    });
  });

  describe("GET /api/admin/ingestion/:id", () => {
    it("requires admin", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/ingestion/${createdRunIds[0]}`,
        headers: { cookie: userCookie }
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns the run detail with its items", async () => {
      const db = getDb();
      const runId = createdRunIds[0]!;
      await db.insert(ingestionItems).values({
        runId,
        sourceKey: uniqueKey("item"),
        status: "INDEXED",
        message: null
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/ingestion/${runId}`,
        headers: { cookie: adminCookie }
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.run.id).toBe(runId);
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.items[0]).toHaveProperty("sourceKey");
    });

    it("returns 404 for a nonexistent run id", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/ingestion/00000000-0000-0000-0000-000000000000",
        headers: { cookie: adminCookie }
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
    });
  });
});
