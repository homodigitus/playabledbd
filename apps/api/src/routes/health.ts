import type { FastifyInstance } from "fastify";
import { loadRagConfig } from "@lumen/rag";
import { checkDatabaseOk, checkPgvectorOk } from "../util/readiness.js";

export async function registerHealthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/health/live", async () => ({ status: "ok" }));

  /** Deliberately avoids any paid AI-provider call — readiness must not depend on, or spend money
   * on, an external API being reachable. */
  fastify.get("/health/ready", async (_request, reply) => {
    let configOk = true;
    try {
      loadRagConfig();
    } catch {
      configOk = false;
    }

    const [databaseOk, pgvectorOk] = await Promise.all([checkDatabaseOk(), checkPgvectorOk()]);
    const checks = { config: configOk, database: databaseOk, pgvector: pgvectorOk };
    const ready = Object.values(checks).every(Boolean);

    reply.status(ready ? 200 : 503).send({ status: ready ? "ready" : "not_ready", checks });
  });
}
