import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { ingestionItems, ingestionRuns, getDb } from "@lumen/db";
import { runIngestion } from "@lumen/rag";
import {
  ApiError,
  ingestionRunDetailResponseSchema,
  ingestionRunListResponseSchema,
  triggerIngestionRequestSchema,
  type IngestionItemDto,
  type IngestionRunDetailResponse,
  type IngestionRunDto,
  type IngestionRunListResponse
} from "@lumen/shared";
import { requireAdmin } from "../../auth/guards.js";
import { parseOrThrow } from "../../util/validate.js";
import { toIso } from "../../util/dto.js";

const idParamsSchema = z.object({ id: z.string().uuid() });

function toRunDto(run: typeof ingestionRuns.$inferSelect): IngestionRunDto {
  return {
    id: run.id,
    status: run.status as IngestionRunDto["status"],
    triggeredByUserId: run.triggeredByUserId,
    sourcePath: run.sourcePath,
    startedAt: run.startedAt ? toIso(run.startedAt) : null,
    finishedAt: run.finishedAt ? toIso(run.finishedAt) : null,
    documentsSeen: run.documentsSeen,
    documentsIndexed: run.documentsIndexed,
    documentsSkipped: run.documentsSkipped,
    documentsFailed: run.documentsFailed,
    chunksCreated: run.chunksCreated,
    errorSummary: run.errorSummary
  };
}

function toItemDto(item: typeof ingestionItems.$inferSelect): IngestionItemDto {
  return {
    id: item.id,
    runId: item.runId,
    sourceKey: item.sourceKey,
    documentId: item.documentId,
    status: item.status as IngestionItemDto["status"],
    message: item.message,
    startedAt: item.startedAt ? toIso(item.startedAt) : null,
    finishedAt: item.finishedAt ? toIso(item.finishedAt) : null
  };
}

export async function registerAdminIngestionRoutes(fastify: FastifyInstance): Promise<void> {
  /** The admin HTTP endpoint never accepts a caller-supplied filesystem path — only the trusted
   * local CLI (`pnpm ingest --source <path>`) may override the corpus root, to close off any
   * path-traversal surface reachable over the network. */
  fastify.post("/api/admin/ingestion", { preHandler: requireAdmin }, async (request, reply) => {
    const body = parseOrThrow(triggerIngestionRequestSchema, request.body ?? {});
    if (body.sourcePath) {
      throw new ApiError(
        400,
        "SOURCE_PATH_NOT_CONFIGURABLE",
        "The ingestion source path is fixed by server configuration (CORPUS_ROOT) and cannot be set via the API"
      );
    }

    const summary = await runIngestion({ triggeredByUserId: request.user!.id });

    const db = getDb();
    const rows = await db.select().from(ingestionRuns).where(eq(ingestionRuns.id, summary.runId)).limit(1);
    const run = rows[0];
    if (!run) throw new ApiError(500, "INTERNAL_ERROR", "Ingestion run not found after completion");

    reply.send({ run: toRunDto(run) });
  });

  fastify.get("/api/admin/ingestion", { preHandler: requireAdmin }, async (_request, reply) => {
    const db = getDb();
    const rows = await db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.createdAt)).limit(20);

    const response: IngestionRunListResponse = { runs: rows.map(toRunDto) };
    reply.send(ingestionRunListResponseSchema.parse(response));
  });

  fastify.get("/api/admin/ingestion/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const db = getDb();

    const runRows = await db.select().from(ingestionRuns).where(eq(ingestionRuns.id, id)).limit(1);
    const run = runRows[0];
    if (!run) throw new ApiError(404, "NOT_FOUND", "Ingestion run not found");

    const itemRows = await db.select().from(ingestionItems).where(eq(ingestionItems.runId, id));

    const response: IngestionRunDetailResponse = {
      run: toRunDto(run),
      items: itemRows.map(toItemDto)
    };
    reply.send(ingestionRunDetailResponseSchema.parse(response));
  });
}
