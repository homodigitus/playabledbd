import { z } from "zod";
import { INGESTION_ITEM_STATUSES, INGESTION_RUN_STATUSES } from "../constants.js";

export const ingestionRunDtoSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(INGESTION_RUN_STATUSES),
  triggeredByUserId: z.string().uuid().nullable(),
  sourcePath: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  documentsSeen: z.number().int().nonnegative(),
  documentsIndexed: z.number().int().nonnegative(),
  documentsSkipped: z.number().int().nonnegative(),
  documentsFailed: z.number().int().nonnegative(),
  chunksCreated: z.number().int().nonnegative(),
  errorSummary: z.string().nullable()
});
export type IngestionRunDto = z.infer<typeof ingestionRunDtoSchema>;

export const ingestionItemDtoSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  sourceKey: z.string(),
  documentId: z.string().uuid().nullable(),
  status: z.enum(INGESTION_ITEM_STATUSES),
  message: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable()
});
export type IngestionItemDto = z.infer<typeof ingestionItemDtoSchema>;

export const triggerIngestionRequestSchema = z.object({
  sourcePath: z.string().trim().max(500).optional()
});
export type TriggerIngestionRequest = z.infer<typeof triggerIngestionRequestSchema>;

export const ingestionRunListResponseSchema = z.object({
  runs: z.array(ingestionRunDtoSchema)
});
export type IngestionRunListResponse = z.infer<typeof ingestionRunListResponseSchema>;

export const ingestionRunDetailResponseSchema = z.object({
  run: ingestionRunDtoSchema,
  items: z.array(ingestionItemDtoSchema)
});
export type IngestionRunDetailResponse = z.infer<typeof ingestionRunDetailResponseSchema>;
