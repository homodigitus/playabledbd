import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { loadApiConfig, type ApiConfig } from "./config.js";
import { buildLoggerOptions } from "./logging/logger.js";
import { loadSessionUser } from "./auth/guards.js";
import { registerErrorHandling } from "./plugins/error-handler.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerAskRoutes } from "./routes/ask.js";
import { registerDocumentRoutes } from "./routes/documents.js";
import { registerAdminDocumentRoutes } from "./routes/admin/documents.js";
import { registerAdminIngestionRoutes } from "./routes/admin/ingestion.js";
import { registerAdminStatsRoutes } from "./routes/admin/stats.js";

export async function buildServer(cfg: ApiConfig = loadApiConfig()): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: buildLoggerOptions(cfg)
  });

  fastify.decorateRequest("user", null);

  await fastify.register(cookie);
  // CORS allowlist comes straight from CORS_ORIGINS — never a wildcard, since credentials: true
  // combined with "*" would let any origin read authenticated responses.
  await fastify.register(cors, { origin: cfg.corsOrigins, credentials: true });
  await fastify.register(rateLimit, { max: 200, timeWindow: "1 minute" });

  await fastify.register(swagger, {
    openapi: { info: { title: "Lumen Playables RAG API", version: "0.1.0" } }
  });
  await fastify.register(swaggerUi, { routePrefix: "/docs" });

  registerErrorHandling(fastify, cfg);

  fastify.addHook("onRequest", loadSessionUser);
  fastify.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  await registerHealthRoutes(fastify);
  await registerAuthRoutes(fastify, cfg);
  await registerSearchRoutes(fastify, cfg);
  await registerAskRoutes(fastify, cfg);
  await registerDocumentRoutes(fastify);
  await registerAdminDocumentRoutes(fastify);
  await registerAdminIngestionRoutes(fastify);
  await registerAdminStatsRoutes(fastify);

  return fastify;
}
