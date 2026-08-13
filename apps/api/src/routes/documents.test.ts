import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, inArray } from "drizzle-orm";
import { closeDb, documentChunks, documents, getDb, users } from "@lumen/db";
import { createTestServer, createTestUser, loginAs, uniqueKey, type TestUser } from "../test-utils/db.js";

describe("GET /api/documents/:id", () => {
  let app: FastifyInstance;
  const createdUserIds: string[] = [];
  const createdDocumentIds: string[] = [];
  let user: TestUser;
  let userCookie: string;

  let indexedDocId: string;
  let longChunkContent: string;
  let pendingDocId: string;
  let failedDocId: string;

  beforeAll(async () => {
    app = await createTestServer();
    const db = getDb();

    user = await createTestUser({ role: "USER" });
    createdUserIds.push(user.id);
    userCookie = await loginAs(app, user.email, user.password);

    longChunkContent = "L".repeat(650); // exceeds the route's 500-char snippet truncation

    const [indexedDoc] = await db
      .insert(documents)
      .values({
        sourceKey: uniqueKey("indexed-doc"),
        title: "Indexed Test Document",
        fileName: "indexed.md",
        mimeType: "text/markdown",
        sizeBytes: 1234,
        contentSha256: "a".repeat(64),
        status: "INDEXED",
        chunkCount: 2,
        lastIndexedAt: new Date()
      })
      .returning({ id: documents.id });
    indexedDocId = indexedDoc!.id;
    createdDocumentIds.push(indexedDocId);

    await db.insert(documentChunks).values([
      {
        documentId: indexedDocId,
        chunkIndex: 0,
        content: "Short chunk content.",
        tokenCount: 4,
        embeddingModel: "text-embedding-3-small",
        pageNumber: 1,
        sectionTitle: "Intro"
      },
      {
        documentId: indexedDocId,
        chunkIndex: 1,
        content: longChunkContent,
        tokenCount: 200,
        embeddingModel: "text-embedding-3-small"
      }
    ]);

    const [pendingDoc] = await db
      .insert(documents)
      .values({
        sourceKey: uniqueKey("pending-doc"),
        title: "Pending Test Document",
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
        title: "Failed Test Document",
        fileName: "failed.md",
        mimeType: "text/markdown",
        sizeBytes: 10,
        contentSha256: "c".repeat(64),
        status: "FAILED",
        errorMessage: "parse error: unexpected token"
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

  it("returns the document with its chunks for an authenticated user, truncating long content to 500 chars + ellipsis", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/documents/${indexedDocId}`,
      headers: { cookie: userCookie }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.document).toMatchObject({
      id: indexedDocId,
      title: "Indexed Test Document",
      status: "INDEXED",
      chunkCount: 2
    });
    expect(body.chunks).toHaveLength(2);

    const shortChunk = body.chunks.find((c: { chunkIndex: number }) => c.chunkIndex === 0);
    expect(shortChunk.snippet).toBe("Short chunk content.");
    expect(shortChunk.pageNumber).toBe(1);
    expect(shortChunk.sectionTitle).toBe("Intro");

    const longChunk = body.chunks.find((c: { chunkIndex: number }) => c.chunkIndex === 1);
    expect(longChunk.snippet).toHaveLength(503); // 500 chars + "..."
    expect(longChunk.snippet.endsWith("...")).toBe(true);
    expect(longChunk.snippet.startsWith("L".repeat(500))).toBe(true);
  });

  it("returns 404 for a PENDING document (never leaks non-INDEXED status to non-admin users)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/documents/${pendingDocId}`,
      headers: { cookie: userCookie }
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for a FAILED document", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/documents/${failedDocId}`,
      headers: { cookie: userCookie }
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for a nonexistent id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/documents/00000000-0000-0000-0000-000000000000",
      headers: { cookie: userCookie }
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("returns 400 VALIDATION_ERROR for a non-uuid id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/documents/not-a-uuid",
      headers: { cookie: userCookie }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 UNAUTHENTICATED without a session cookie", async () => {
    const res = await app.inject({ method: "GET", url: `/api/documents/${indexedDocId}` });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("sanity: chunk rows really landed in the database in chunkIndex order", async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.documentId, indexedDocId))
      .orderBy(documentChunks.chunkIndex);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.chunkIndex).toBe(0);
    expect(rows[1]!.chunkIndex).toBe(1);
  });
});
