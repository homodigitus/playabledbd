import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Anchored to this file's own location (not process.cwd()) so env vars still load correctly
// when this app is invoked with a different working directory, e.g. via `pnpm --filter <pkg>
// <script>`, which runs with cwd set to that package's own directory.
loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const apiConfigSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]),
  port: z.coerce.number().int().min(1).max(65535),
  corsOrigins: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim()).filter((s) => s.length > 0)),
  sessionSecret: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  sessionTtlHours: z.coerce.number().int().min(1).max(24 * 30),
  cookieSecure: z.boolean(),
  loginRateLimitMax: z.coerce.number().int().min(1),
  queryRateLimitMax: z.coerce.number().int().min(1)
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;

let cached: ApiConfig | undefined;

/** Fails fast on boot (see src/index.ts) rather than surfacing a confusing runtime error later. */
export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  if (cached) return cached;

  const nodeEnv = env.NODE_ENV === "production" || env.NODE_ENV === "test" ? env.NODE_ENV : "development";

  const parsed = apiConfigSchema.safeParse({
    nodeEnv,
    port: env.PORT ?? "4000",
    corsOrigins: env.CORS_ORIGINS ?? "http://localhost:3000",
    sessionSecret: env.SESSION_SECRET ?? "",
    sessionTtlHours: env.SESSION_TTL_HOURS ?? "168",
    cookieSecure: nodeEnv === "production",
    loginRateLimitMax: env.LOGIN_RATE_LIMIT_MAX ?? "5",
    queryRateLimitMax: env.QUERY_RATE_LIMIT_MAX ?? "30"
  });

  if (!parsed.success) {
    throw new Error(`Invalid API configuration: ${parsed.error.message}`);
  }

  cached = parsed.data;
  return cached;
}

export function resetApiConfigCacheForTests(): void {
  cached = undefined;
}
