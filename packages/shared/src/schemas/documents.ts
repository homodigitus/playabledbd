import { z } from "zod";
import { DOCUMENT_STATUSES } from "../constants.js";

export const documentDtoSchema = z.object({
  id: z.string().uuid(),
  sourceKey: z.string(),
  title: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  status: z.enum(DOCUMENT_STATUSES),
  chunkCount: z.number().int().nonnegative(),
  lastIndexedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type DocumentDto = z.infer<typeof documentDtoSchema>;

export const documentDetailResponseSchema = z.object({
  document: documentDtoSchema,
  chunks: z.array(
    z.object({
      id: z.string().uuid(),
      chunkIndex: z.number().int().nonnegative(),
      snippet: z.string(),
      pageNumber: z.number().int().positive().optional(),
      sectionTitle: z.string().optional(),
      tokenCount: z.number().int().nonnegative()
    })
  )
});
export type DocumentDetailResponse = z.infer<typeof documentDetailResponseSchema>;

export const documentListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

export const documentListResponseSchema = z.object({
  documents: z.array(documentDtoSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int(),
  pageSize: z.number().int()
});
export type DocumentListResponse = z.infer<typeof documentListResponseSchema>;
