import type { FastifyInstance } from "fastify";
import { answerQuestion, loadRagConfig } from "@lumen/rag";
import { askRequestSchema, type AskResponse } from "@lumen/shared";
import { requireAuth } from "../auth/guards.js";
import type { ApiConfig } from "../config.js";
import { parseOrThrow } from "../util/validate.js";
import { logSearch } from "../util/search-log.js";

export async function registerAskRoutes(fastify: FastifyInstance, cfg: ApiConfig): Promise<void> {
  fastify.post(
    "/api/ask",
    { preHandler: requireAuth, config: { rateLimit: { max: cfg.queryRateLimitMax, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = parseOrThrow(askRequestSchema, request.body);
      const startedAt = Date.now();
      const mode = body.mode ?? loadRagConfig().retrievalMode;

      let result: Awaited<ReturnType<typeof answerQuestion>>;
      try {
        result = await answerQuestion(body.query, { topK: body.topK, mode: body.mode });
      } catch (err) {
        await logSearch({
          userId: request.user!.id,
          principal: request.user!.email,
          query: body.query,
          retrievalMode: mode,
          topK: body.topK ?? 5,
          latencyMs: Date.now() - startedAt,
          resultCount: 0,
          topScore: null,
          answerStatus: "ERROR"
        });
        throw err;
      }

      const latencyMs = Date.now() - startedAt;
      await logSearch({
        userId: request.user!.id,
        principal: request.user!.email,
        query: body.query,
        retrievalMode: mode,
        topK: body.topK ?? result.results.length,
        latencyMs,
        resultCount: result.results.length,
        topScore: result.results[0]?.score ?? null,
        answerStatus: result.status === "answered" ? "ANSWERED" : "INSUFFICIENT_CONTEXT"
      });

      const response: AskResponse = {
        answer: result.answer,
        status: result.status,
        citations: result.citations,
        results: result.results,
        requestId: request.id,
        latencyMs
      };
      reply.send(response);
    }
  );
}
