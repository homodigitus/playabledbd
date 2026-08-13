import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, inArray } from "drizzle-orm";
import { closeDb, getDb, users } from "@lumen/db";
import { createTestServer, createTestUser, extractSessionCookie, type TestUser } from "../test-utils/db.js";

describe("auth routes", () => {
  let app: FastifyInstance;
  const createdUserIds: string[] = [];

  let activeUser: TestUser;
  let inactiveUser: TestUser;

  beforeAll(async () => {
    app = await createTestServer();

    activeUser = await createTestUser({ password: "CorrectHorse123!" });
    createdUserIds.push(activeUser.id);

    inactiveUser = await createTestUser({ password: "CorrectHorse123!", isActive: false });
    createdUserIds.push(inactiveUser.id);
  });

  afterAll(async () => {
    const db = getDb();
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await app.close();
    await closeDb();
  });

  describe("POST /api/auth/login", () => {
    it("succeeds with correct credentials, sets a lumen_sid cookie, and returns the user dto", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: activeUser.email, password: activeUser.password }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user).toMatchObject({
        id: activeUser.id,
        email: activeUser.email,
        role: "USER"
      });
      expect(typeof body.user.createdAt).toBe("string");

      const cookie = extractSessionCookie(res.headers["set-cookie"]);
      expect(cookie).toMatch(/^lumen_sid=.+\..+$/);
    });

    it("fails with 401 INVALID_CREDENTIALS for a wrong password", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: activeUser.email, password: "definitely-wrong-password" }
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error.code).toBe("INVALID_CREDENTIALS");
      expect(body.error.requestId).toBeTruthy();
    });

    it("fails with 401 INVALID_CREDENTIALS for a nonexistent email", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "no-such-user@test.lumenplayables.internal", password: "whatever123" }
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
    });

    it("fails with 401 INVALID_CREDENTIALS for an inactive user, even with the correct password", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: inactiveUser.email, password: inactiveUser.password }
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
    });

    it("returns 400 VALIDATION_ERROR for a malformed body", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "not-an-email", password: "" }
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns the user for a valid session cookie", async () => {
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: activeUser.email, password: activeUser.password }
      });
      const cookie = extractSessionCookie(loginRes.headers["set-cookie"]);

      const res = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
      expect(res.statusCode).toBe(200);
      expect(res.json().user).toMatchObject({ id: activeUser.id, email: activeUser.email });
    });

    it("returns { user: null } with no cookie", async () => {
      const res = await app.inject({ method: "GET", url: "/api/auth/me" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ user: null });
    });

    it("returns { user: null } for a well-formed but nonexistent session cookie", async () => {
      // Must be UUID-shaped: the session id half is compared against a `uuid` column, and a
      // non-UUID string there causes a raw Postgres type error rather than a graceful miss.
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: "lumen_sid=00000000-0000-0000-0000-000000000000.bogus-secret" }
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ user: null });
    });
  });

  describe("POST /api/auth/logout", () => {
    it("requires auth: 401 without a cookie", async () => {
      const res = await app.inject({ method: "POST", url: "/api/auth/logout" });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHENTICATED");
    });

    it("succeeds (204) with a valid cookie and revokes the session", async () => {
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: activeUser.email, password: activeUser.password }
      });
      const cookie = extractSessionCookie(loginRes.headers["set-cookie"]);

      const logoutRes = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
      expect(logoutRes.statusCode).toBe(204);
      expect(logoutRes.body).toBe("");

      const meRes = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
      expect(meRes.statusCode).toBe(200);
      expect(meRes.json()).toEqual({ user: null });
    });
  });

  it("sanity: seeded active user really exists with the expected role in the database", async () => {
    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.id, activeUser.id)).limit(1);
    expect(rows[0]?.email).toBe(activeUser.email);
    expect(rows[0]?.role).toBe("USER");
  });
});
