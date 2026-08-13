import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiError } from "@lumen/shared";
import { SESSION_COOKIE_NAME } from "./constants.js";
import { resolveSessionUser, type SessionUser } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

/** Runs on every request (registered as an onRequest hook in server.ts) so route handlers can rely
 * on request.user being populated without each one re-parsing the cookie. Never throws — routes
 * that require auth call requireAuth/requireAdmin explicitly. */
export async function loadSessionUser(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const cookieValue = request.cookies[SESSION_COOKIE_NAME];
  request.user = await resolveSessionUser(cookieValue);
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.user) {
    throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (request.user?.role !== "ADMIN") {
    throw new ApiError(403, "FORBIDDEN", "Admin role required");
  }
}
