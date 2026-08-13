import { z } from "zod";
import { RETRIEVAL_DEFAULTS } from "../constants.js";

export const mcpSearchInputSchema = z.object({
  query: z.string().trim().min(2).max(500),
  topK: z.number().int().min(1).max(RETRIEVAL_DEFAULTS.maxTopK).optional(),
  mode: z.enum(["vector", "hybrid"]).optional()
});
export type McpSearchInput = z.infer<typeof mcpSearchInputSchema>;

export const mcpSearchResultItemSchema = z.object({
  chunkId: z.string().uuid(),
  documentId: z.string().uuid(),
  documentTitle: z.string(),
  sourceKey: z.string(),
  pageNumber: z.number().int().positive().optional(),
  sectionTitle: z.string().optional(),
  content: z.string(),
  score: z.number(),
  rank: z.number().int().positive()
});
export type McpSearchResultItem = z.infer<typeof mcpSearchResultItemSchema>;

export const mcpSearchOutputSchema = z.object({
  results: z.array(mcpSearchResultItemSchema),
  resultCount: z.number().int().nonnegative(),
  requestId: z.string()
});
export type McpSearchOutput = z.infer<typeof mcpSearchOutputSchema>;
