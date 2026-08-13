import type { FastifyInstance } from "fastify";
import { loadRagConfig, retrieve, toSearchResult } from "@lumen/rag";
import { searchRequestSchema, type SearchResponse } from "@lumen/shared";
import { requireAuth } from "../auth/guards.js";
import type { ApiConfig } from "../config.js";
import { parseOrThrow } from "../util/validate.js";
import { logSearch } from "../util/search-log.js";

export async function registerSearchRoutes(fastify: FastifyInstance, cfg: ApiConfig): Promise<void> {
  fastify.post(
    "/api/search",
    { preHandler: requireAuth, config: { rateLimit: { max: cfg.queryRateLimitMax, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = parseOrThrow(searchRequestSchema, request.body);
      const startedAt = Date.now();

      const results = await retrieve({ query: body.query, topK: body.topK, mode: body.mode });
      const latencyMs = Date.now() - startedAt;
      const searchResults = results.map(toSearchResult);
      const mode = body.mode ?? loadRagConfig().retrievalMode;

      await logSearch({
        userId: request.user!.id,
        principal: request.user!.email,
        query: body.query,
        retrievalMode: mode,
        topK: body.topK ?? searchResults.length,
        latencyMs,
        resultCount: searchResults.length,
        topScore: searchResults[0]?.score ?? null,
        answerStatus: searchResults.length > 0 ? "ANSWERED" : "INSUFFICIENT_CONTEXT"
      });

      const response: SearchResponse = {
        results: searchResults,
        resultCount: searchResults.length,
        requestId: request.id,
        latencyMs
      };
      reply.send(response);
    }
  );
}
