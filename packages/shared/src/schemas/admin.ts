import { z } from "zod";

export const statsOverviewResponseSchema = z.object({
  documents: z.object({
    total: z.number().int().nonnegative(),
    indexed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    removed: z.number().int().nonnegative()
  }),
  chunks: z.object({
    total: z.number().int().nonnegative()
  }),
  lastIngestion: z
    .object({
      id: z.string().uuid(),
      status: z.string(),
      finishedAt: z.string().nullable()
    })
    .nullable(),
  search: z.object({
    last24h: z.number().int().nonnegative(),
    last7d: z.number().int().nonnegative(),
    avgLatencyMs: z.number().nonnegative(),
    p95LatencyMs: z.number().nonnegative(),
    avgResultCount: z.number().nonnegative(),
    insufficientContextRate: z.number().min(0).max(1)
  }),
  readiness: z.object({
    databaseOk: z.boolean(),
    pgvectorOk: z.boolean()
  })
});
export type StatsOverviewResponse = z.infer<typeof statsOverviewResponseSchema>;

export const recentSearchLogSchema = z.object({
  id: z.string().uuid(),
  query: z.string(),
  retrievalMode: z.string(),
  resultCount: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  answerStatus: z.string(),
  createdAt: z.string()
});
export type RecentSearchLog = z.infer<typeof recentSearchLogSchema>;

export const recentSearchesResponseSchema = z.object({
  searches: z.array(recentSearchLogSchema)
});
export type RecentSearchesResponse = z.infer<typeof recentSearchesResponseSchema>;
