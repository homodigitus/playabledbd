import { and, count, eq, ilike, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { documentChunks, documents, getDb } from "@lumen/db";
import {
  ApiError,
  documentDetailResponseSchema,
  documentListQuerySchema,
  documentListResponseSchema,
  type DocumentDetailResponse,
  type DocumentListResponse
} from "@lumen/shared";
import { requireAdmin } from "../../auth/guards.js";
import { parseOrThrow } from "../../util/validate.js";
import { idParamsSchema, toDocumentDto } from "../documents.js";

export async function registerAdminDocumentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/admin/documents", { preHandler: requireAdmin }, async (request, reply) => {
    const query = parseOrThrow(documentListQuerySchema, request.query);
    const db = getDb();

    const conditions = [];
    if (query.status) conditions.push(eq(documents.status, query.status));
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(ilike(documents.title, pattern), ilike(documents.fileName, pattern), ilike(documents.sourceKey, pattern))
      );
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRows = await db
      .select({ value: count() })
      .from(documents)
      .where(whereClause);
    const total = totalRows[0]?.value ?? 0;

    const rows = await db
      .select()
      .from(documents)
      .where(whereClause)
      .orderBy(documents.updatedAt)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const response: DocumentListResponse = {
      documents: rows.map(toDocumentDto),
      total,
      page: query.page,
      pageSize: query.pageSize
    };
    reply.send(documentListResponseSchema.parse(response));
  });

  fastify.get("/api/admin/documents/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const db = getDb();

    const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    const doc = rows[0];
    if (!doc) throw new ApiError(404, "NOT_FOUND", "Document not found");

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
