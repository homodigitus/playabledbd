import { closeDb } from "@lumen/db";
import { loadMcpConfig } from "./config.js";
import { runStdioTransport } from "./transports/stdio.js";
import { runHttpTransport } from "./transports/http.js";

async function main(): Promise<void> {
  const cfg = loadMcpConfig();

  if (cfg.transport === "stdio") {
    await runStdioTransport();
  } else {
    await runHttpTransport(cfg);
  }

  const shutdown = async (): Promise<void> => {
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
