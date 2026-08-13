import { closeDb } from "@lumen/db";
import { loadApiConfig } from "./config.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const cfg = loadApiConfig();
  const fastify = await buildServer(cfg);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    fastify.log.info({ signal }, "shutting down");
    try {
      await fastify.close();
      await closeDb();
      process.exit(0);
    } catch (err) {
      fastify.log.error({ err }, "error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await fastify.listen({ host: "0.0.0.0", port: cfg.port });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
