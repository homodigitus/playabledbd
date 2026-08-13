import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray } from "drizzle-orm";
import { closeDb, documents, getDb, users } from "@lumen/db";
import { createTestServer, createTestUser, loginAs, uniqueKey, type TestUser } from "../../test-utils/db.js";

describe("admin document routes", () => {
  let app: FastifyInstance;
  const createdUserIds: string[] = [];
  const createdDocumentIds: string[] = [];
  let admin: TestUser;
  let plainUser: TestUser;
  let adminCookie: string;
  let userCookie: string;

  let indexedDocId: string;
  let pendingDocId: string;
  let failedDocId: string;
  const searchToken = uniqueKey("needle");

  beforeAll(async () => {
    app = await createTestServer();
    admin = await createTestUser({ role: "ADMIN" });
    plainUser = await createTestUser({ role: "USER" });
    createdUserIds.push(admin.id, plainUser.id);
    adminCookie = await loginAs(app, admin.email, admin.password);
    userCookie = await loginAs(app, plainUser.email, plainUser.password);

    const db = getDb();

    const [indexedDoc] = await db
      .insert(documents)
      .values({
        sourceKey: uniqueKey("indexed-doc"),
        title: `Findable ${searchToken} Document`,
        fileName: "indexed.md",
        mimeType: "text/markdown",
        sizeBytes: 100,
        contentSha256: "a".repeat(64),
        status: "INDEXED",
        chunkCount: 1,
        lastIndexedAt: new Date()
      })
      .returning({ id: documents.id });
    indexedDocId = indexedDoc!.id;
    createdDocumentIds.push(indexedDocId);

    const [pendingDoc] = await db
      .insert(documents)
      .values({
        sourceKey: uniqueKey("pending-doc"),
        title: "Pending Doc",
        fileName: "pending.md",
        mimeType: "text/markdown",
        sizeBytes: 10,
        contentSha256: "b".repeat(64),
        status: "PENDING"
      })
      .returning({ id: documents.id });
    pendingDocId = pendingDoc!.id;
    createdDocumentIds.push(pendingDocId);

    const [failedDoc] = await db
      .insert(documents)
      .values({
        sourceKey: uniqueKey("failed-doc"),
        title: "Failed Doc",
        fileName: "failed.md",
        mimeType: "text/markdown",
        sizeBytes: 10,
        contentSha256: "c".repeat(64),
        status: "FAILED",
        errorMessage: "boom"
      })
      .returning({ id: documents.id });
    failedDocId = failedDoc!.id;
    createdDocumentIds.push(failedDocId);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(documents).where(inArray(documents.id, createdDocumentIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
    await app.close();
    await closeDb();
  });

  describe("GET /api/admin/documents", () => {
    it("requires admin: 401 with no session, 403 for a plain user", async () => {
      const noSession = await app.inject({ method: "GET", url: "/api/admin/documents" });
      expect(noSession.statusCode).toBe(401);

      const asUser = await app.inject({
        method: "GET",
        url: "/api/admin/documents",
        headers: { cookie: userCookie }
      });
      expect(asUser.statusCode).toBe(403);
    });

    it("filters by status", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/documents?status=FAILED",
        headers: { cookie: adminCookie }
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.documents.every((d: { status: string }) => d.status === "FAILED")).toBe(true);
      expect(body.documents.some((d: { id: string }) => d.id === failedDocId)).toBe(true);
    });

    it("filters by search across title/fileName/sourceKey", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/documents?search=${encodeURIComponent(searchToken)}`,
        headers: { cookie: adminCookie }
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.documents).toHaveLength(1);
      expect(body.documents[0].id).toBe(indexedDocId);
    });

    it("applies pagination defaults (page=1, pageSize=20) when omitted", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/documents",
        headers: { cookie: adminCookie }
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(20);
      expect(body.total).toBeGreaterThanOrEqual(3);
    });

    it("coerces string page/pageSize query params and paginates correctly", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/documents?page=1&pageSize=1",
        headers: { cookie: adminCookie }
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(1);
      expect(body.documents).toHaveLength(1);
    });
  });

  describe("GET /api/admin/documents/:id", () => {
    it("requires admin", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/documents/${pendingDocId}`,
        headers: { cookie: userCookie }
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns a PENDING document (unlike the non-admin route, admins see any status)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/documents/${pendingDocId}`,
        headers: { cookie: adminCookie }
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().document).toMatchObject({ id: pendingDocId, status: "PENDING" });
    });

    it("returns a FAILED document with its errorMessage", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/documents/${failedDocId}`,
        headers: { cookie: adminCookie }
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().document).toMatchObject({ id: failedDocId, status: "FAILED", errorMessage: "boom" });
    });

    it("returns 404 for a nonexistent id", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/documents/00000000-0000-0000-0000-000000000000",
        headers: { cookie: adminCookie }
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
    });
  });
});
