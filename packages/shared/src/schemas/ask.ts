import { z } from "zod";
import { ASK_RESPONSE_STATUSES } from "../constants.js";
import { searchRequestSchema, searchResultSchema } from "./search.js";

export const askRequestSchema = searchRequestSchema;
export type AskRequest = z.infer<typeof askRequestSchema>;

export const citationSchema = z.object({
  id: z.number().int().positive(),
  documentId: z.string().uuid(),
  documentTitle: z.string(),
  sourceKey: z.string(),
  chunkId: z.string().uuid(),
  pageNumber: z.number().int().positive().optional(),
  sectionTitle: z.string().optional(),
  quote: z.string().optional()
});
export type Citation = z.infer<typeof citationSchema>;

export const askResponseSchema = z.object({
  answer: z.string(),
  status: z.enum(ASK_RESPONSE_STATUSES),
  citations: z.array(citationSchema),
  results: z.array(searchResultSchema),
  requestId: z.string(),
  latencyMs: z.number().nonnegative()
});
export type AskResponse = z.infer<typeof askResponseSchema>;
