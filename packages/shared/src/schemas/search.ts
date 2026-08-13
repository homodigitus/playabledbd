import { z } from "zod";
import { RETRIEVAL_DEFAULTS, RETRIEVAL_MODES } from "../constants.js";

export const searchResultSchema = z.object({
  chunkId: z.string().uuid(),
  documentId: z.string().uuid(),
  documentTitle: z.string(),
  sourceKey: z.string(),
  snippet: z.string(),
  pageNumber: z.number().int().positive().optional(),
  sectionTitle: z.string().optional(),
  score: z.number(),
  rank: z.number().int().positive()
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchRequestSchema = z.object({
  query: z.string().trim().min(2).max(500),
  topK: z.number().int().min(1).max(RETRIEVAL_DEFAULTS.maxTopK).optional(),
  mode: z.enum(RETRIEVAL_MODES).optional()
});
export type SearchRequest = z.infer<typeof searchRequestSchema>;

export const searchResponseSchema = z.object({
  results: z.array(searchResultSchema),
  resultCount: z.number().int().nonnegative(),
  requestId: z.string(),
  latencyMs: z.number().nonnegative()
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
