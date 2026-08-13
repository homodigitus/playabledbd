import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray } from "drizzle-orm";
import { closeDb, getDb, users } from "@lumen/db";
import { createTestServer, createTestUser, loginAs, type TestUser } from "../test-utils/db.js";

/** Cross-cutting auth-guard behavior (requireAuth/requireAdmin), exercised against a real admin
 * route (/api/admin/documents) rather than duplicated in every admin route's own test file. */
describe("auth guards (requireAuth / requireAdmin)", () => {
  let app: FastifyInstance;
  const createdUserIds: string[] = [];
  let plainUser: TestUser;
  let adminUser: TestUser;

  beforeAll(async () => {
    app = await createTestServer();
    plainUser = await createTestUser({ role: "USER" });
    adminUser = await createTestUser({ role: "ADMIN" });
    createdUserIds.push(plainUser.id, adminUser.id);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(users).where(inArray(users.id, createdUserIds));
    await app.close();
    await closeDb();
  });

  it("401 UNAUTHENTICATED for an admin-only route with no session at all", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/documents" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("403 FORBIDDEN for an admin-only route when authenticated as a plain USER", async () => {
    const cookie = await loginAs(app, plainUser.email, plainUser.password);
    const res = await app.inject({ method: "GET", url: "/api/admin/documents", headers: { cookie } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("allows an ADMIN through to the admin-only route", async () => {
    const cookie = await loginAs(app, adminUser.email, adminUser.password);
    const res = await app.inject({ method: "GET", url: "/api/admin/documents", headers: { cookie } });
    expect(res.statusCode).toBe(200);
  });

  it("401 UNAUTHENTICATED for a plain-auth-only route (/api/documents/:id) with no session", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/documents/00000000-0000-0000-0000-000000000000"
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });
});
