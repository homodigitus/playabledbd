import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { UserRole } from "@lumen/shared";
import { getDb, users } from "@lumen/db";
import { hashPassword } from "../auth/password.js";
import { resetApiConfigCacheForTests } from "../config.js";
import { buildServer } from "../server.js";

/** Distinguishing domain for every user row created by the test suite, so cleanup and manual
 * inspection can always tell test fixtures apart from any pre-existing/manually-seeded data. */
export const TEST_EMAIL_DOMAIN = "test.lumenplayables.internal";

/** Prefix applied to any document/sourceKey/title fixtures created by tests, for the same reason. */
export const TEST_FIXTURE_PREFIX = "test-fixture";

/** Sets the env vars `loadApiConfig()`/`buildServer()` need, without clobbering anything a
 * developer may already have exported in their shell. Must run before the first `buildServer()`
 * call in a given test file (config is cached as a module singleton after that). */
export function setTestEnv(): void {
  process.env.NODE_ENV = "test";
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    process.env.SESSION_SECRET = "test-only-session-secret-at-least-32-characters-long";
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://lumen:lumen@localhost:5432/lumen_rag";
  }
  if (!process.env.CORS_ORIGINS) {
    process.env.CORS_ORIGINS = "http://localhost:3000";
  }
  // Tests exercise login/search/ask repeatedly within the same 1-minute window; keep the default
  // rate limits from ever interfering with functional assertions (rate limiting itself is not
  // under test here).
  if (!process.env.LOGIN_RATE_LIMIT_MAX) {
    process.env.LOGIN_RATE_LIMIT_MAX = "1000";
  }
  if (!process.env.QUERY_RATE_LIMIT_MAX) {
    process.env.QUERY_RATE_LIMIT_MAX = "1000";
  }
}

/** Builds a real Fastify instance (real Postgres, real session/auth logic) ready for `inject()`. */
export async function createTestServer(): Promise<FastifyInstance> {
  setTestEnv();
  resetApiConfigCacheForTests();
  const app = await buildServer();
  await app.ready();
  return app;
}

export function uniqueEmail(label: string): string {
  return `${label}.${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
}

export function uniqueKey(label: string): string {
  return `${TEST_FIXTURE_PREFIX}-${label}-${randomUUID()}`;
}

export type TestUser = { id: string; email: string; password: string; role: UserRole };

/** Inserts a real, login-able user (argon2-hashed password) directly via drizzle. */
export async function createTestUser(
  opts: {
    email?: string;
    password?: string;
    name?: string;
    role?: UserRole;
    isActive?: boolean;
  } = {}
): Promise<TestUser> {
  const db = getDb();
  const email = opts.email ?? uniqueEmail("user");
  const password = opts.password ?? "TestPassword123!";
  const passwordHash = await hashPassword(password);
  const role = opts.role ?? "USER";

  const [row] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name: opts.name ?? "Test User",
      role,
      isActive: opts.isActive ?? true
    })
    .returning({ id: users.id });

  return { id: row!.id, email, password, role };
}

/** Extracts the `lumen_sid=...` cookie pair (name=value, no attributes) from a `set-cookie`
 * response header so it can be replayed on a subsequent `inject()` call's `cookies`/`headers`. */
export function extractSessionCookie(setCookieHeader: string | string[] | undefined): string {
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
  for (const header of headers) {
    const match = /(?:^|;\s*)lumen_sid=([^;]+)/.exec(header);
    if (match) return `lumen_sid=${match[1]}`;
  }
  throw new Error(`lumen_sid cookie not found in set-cookie header(s): ${JSON.stringify(setCookieHeader)}`);
}

/** Logs in via a real injected request (exercising the real login route) and returns the resulting
 * session cookie string, ready to attach to further `inject()` calls via the `cookies` option. */
export async function loginAs(app: FastifyInstance, email: string, password: string): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
  if (res.statusCode !== 200) {
    throw new Error(`test login failed for ${email}: ${res.statusCode} ${res.body}`);
  }
  return extractSessionCookie(res.headers["set-cookie"]);
}
