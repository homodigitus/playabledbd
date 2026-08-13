import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Anchored to this file's own location (not process.cwd()) so env vars still load correctly
// when this app is invoked with a different working directory, e.g. via `pnpm --filter <pkg>
// <script>`, which runs with cwd set to that package's own directory.
loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const mcpConfigSchema = z.object({
  transport: z.enum(["stdio", "http"]).default("stdio"),
  port: z.coerce.number().int().positive().default(4100),
  authToken: z.string().optional()
});

export type McpConfig = z.infer<typeof mcpConfigSchema>;

let cached: McpConfig | null = null;

export function loadMcpConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  if (cached) return cached;

  const parsed = mcpConfigSchema.safeParse({
    transport: env.MCP_TRANSPORT,
    port: env.MCP_PORT,
    authToken: env.MCP_AUTH_TOKEN
  });

  if (!parsed.success) {
    throw new Error(`Invalid MCP configuration: ${parsed.error.message}`);
  }

  if (parsed.data.transport === "http" && !parsed.data.authToken) {
    throw new Error("MCP_AUTH_TOKEN is required when MCP_TRANSPORT=http");
  }

  cached = parsed.data;
  return cached;
}

export function resetMcpConfigCacheForTests(): void {
  cached = null;
}
