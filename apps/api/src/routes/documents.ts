import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { documentChunks, documents, getDb } from "@lumen/db";
import { ApiError, documentDetailResponseSchema, type DocumentDetailResponse, type DocumentDto } from "@lumen/shared";
import { requireAuth } from "../auth/guards.js";
import { parseOrThrow } from "../util/validate.js";
import { toIso } from "../util/dto.js";

const idParamsSchema = z.object({ id: z.string().uuid() });

function toDocumentDto(doc: typeof documents.$inferSelect): DocumentDto {
  return {
    id: doc.id,
    sourceKey: doc.sourceKey,
    title: doc.title,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    status: doc.status as DocumentDto["status"],
    chunkCount: doc.chunkCount,
    lastIndexedAt: doc.lastIndexedAt ? toIso(doc.lastIndexedAt) : null,
    errorMessage: doc.errorMessage,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt)
  };
}

/** The shared (non-admin) document detail route: only ever exposes INDEXED documents. A
 * FAILED/REMOVED/PENDING document behaves as 404 for regular users so its status/error internals
 * never leak outside the admin surface. */
export async function registerDocumentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/documents/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const db = getDb();

    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.status, "INDEXED")))
      .limit(1);
    const doc = rows[0];
    if (!doc) {
      throw new ApiError(404, "NOT_FOUND", "Document not found");
    }

    const chunkRows = await db
      .select({
        id: documentChunks.id,
        chunkIndex: documentChunks.chunkIndex,
        content: documentChunks.content,
        pageNumber: documentChunks.pageNumber,
        sectionTitle: documentChunks.sectionTitle,
        tokenCount: documentChunks.tokenCount
      })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, id))
      .orderBy(documentChunks.chunkIndex);

    const response: DocumentDetailResponse = {
      document: toDocumentDto(doc),
      chunks: chunkRows.map((c) => ({
        id: c.id,
        chunkIndex: c.chunkIndex,
        snippet: c.content.length > 500 ? `${c.content.slice(0, 500)}...` : c.content,
        pageNumber: c.pageNumber ?? undefined,
        sectionTitle: c.sectionTitle ?? undefined,
        tokenCount: c.tokenCount
      }))
    };

    reply.send(documentDetailResponseSchema.parse(response));
  });
}

export { toDocumentDto, idParamsSchema };
