import type { FastifyError, FastifyInstance } from "fastify";
import { ApiError } from "@lumen/shared";
import type { ApiConfig } from "../config.js";
import { IngestionConflictError } from "@lumen/rag";

/** Never leaks stack traces, DB errors, or provider error internals to the client in production —
 * only ApiError's own curated message/code cross that boundary; everything else is logged
 * server-side and replaced with a generic message. */
export function registerErrorHandling(fastify: FastifyInstance, cfg: ApiConfig): void {
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: "NOT_FOUND", message: "Resource not found", requestId: request.id }
    });
  });

  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = request.id;

    if (error instanceof ApiError) {
      reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, requestId, details: error.details }
      });
      return;
    }

    if (error instanceof IngestionConflictError) {
      reply.status(409).send({
        error: { code: "INGESTION_IN_PROGRESS", message: error.message, requestId }
      });
      return;
    }

    if (error.validation) {
      reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", requestId, details: error.validation }
      });
      return;
    }

    request.log.error({ err: error }, "unhandled error");

    const rawStatus = (error as { statusCode?: number }).statusCode;
    const statusCode = rawStatus && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
    const message = statusCode >= 500 && cfg.nodeEnv === "production" ? "Internal server error" : error.message;

    reply.status(statusCode).send({
      error: { code: "INTERNAL_ERROR", message, requestId }
    });
  });
}
