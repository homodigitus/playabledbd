import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getDb, users } from "@lumen/db";
import { ApiError, loginRequestSchema, type UserDto } from "@lumen/shared";
import { verifyPassword } from "../auth/password.js";
import { SESSION_COOKIE_NAME } from "../auth/constants.js";
import { createSession, revokeSessionByCookie } from "../auth/session.js";
import { requireAuth } from "../auth/guards.js";
import type { ApiConfig } from "../config.js";
import { toIso } from "../util/dto.js";
import { parseOrThrow } from "../util/validate.js";

function toUserDto(user: { id: string; email: string; name: string; role: string; createdAt: Date }): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserDto["role"],
    createdAt: toIso(user.createdAt)
  };
}

export async function registerAuthRoutes(fastify: FastifyInstance, cfg: ApiConfig): Promise<void> {
  fastify.post(
    "/api/auth/login",
    { config: { rateLimit: { max: cfg.loginRateLimitMax, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = parseOrThrow(loginRequestSchema, request.body);

      const db = getDb();
      const rows = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
      const user = rows[0];

      // Constant response shape/timing-insensitive path: always attempt a verify even when the
      // user doesn't exist, using a fixed dummy hash, so login can't be used to enumerate emails
      // by response latency.
      const dummyHash =
        "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
      const passwordOk = await verifyPassword(user?.passwordHash ?? dummyHash, body.password);

      if (!user || !user.isActive || !passwordOk) {
        throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
      }

      const { cookieValue, expiresAt } = await createSession(user.id);
      reply.setCookie(SESSION_COOKIE_NAME, cookieValue, {
        httpOnly: true,
        secure: cfg.cookieSecure,
        sameSite: "lax",
        path: "/",
        expires: expiresAt
      });

      reply.send({ user: toUserDto(user) });
    }
  );

  fastify.post("/api/auth/logout", { preHandler: requireAuth }, async (request, reply) => {
    await revokeSessionByCookie(request.cookies[SESSION_COOKIE_NAME]);
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    reply.status(204).send();
  });

  fastify.get("/api/auth/me", async (request, reply) => {
    reply.send({ user: request.user ? toUserDto({ ...request.user }) : null });
  });
}
