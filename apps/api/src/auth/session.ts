import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, sessions, users } from "@lumen/db";
import type { UserRole } from "@lumen/shared";
import { loadApiConfig } from "../config.js";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
};

function splitCookieValue(cookieValue: string): { sessionId: string; secret: string } | null {
  const separatorIdx = cookieValue.indexOf(".");
  if (separatorIdx <= 0) return null;
  const sessionId = cookieValue.slice(0, separatorIdx);
  const secret = cookieValue.slice(separatorIdx + 1);
  if (!secret) return null;
  return { sessionId, secret };
}

/** Always issues a brand-new session row (never reuses/extends an existing one) so a login can
 * never be used to fixate a pre-existing session id onto a victim. */
export async function createSession(userId: string): Promise<{ cookieValue: string; expiresAt: Date }> {
  const cfg = loadApiConfig();
  const secret = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + cfg.sessionTtlHours * 60 * 60 * 1000);

  const db = getDb();
  const [session] = await db
    .insert(sessions)
    .values({ userId, tokenHash: sha256(secret), expiresAt })
    .returning({ id: sessions.id });

  return { cookieValue: `${session!.id}.${secret}`, expiresAt };
}

/** The cookie is `${sessionId}.${secret}`: the id is used only to look up the row, the secret is
 * compared against its stored hash in constant time, so a leaked/guessed id alone is useless. */
export async function resolveSessionUser(cookieValue: string | undefined): Promise<SessionUser | null> {
  if (!cookieValue) return null;
  const split = splitCookieValue(cookieValue);
  if (!split) return null;

  const db = getDb();
  const rows = await db
    .select({
      tokenHash: sessions.tokenHash,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, split.sessionId))
    .limit(1);

  const row = rows[0];
  if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now() || !row.isActive) return null;

  const expected = Buffer.from(row.tokenHash, "hex");
  const actual = Buffer.from(sha256(split.secret), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  return { id: row.userId, email: row.email, name: row.name, role: row.role as UserRole, createdAt: row.createdAt };
}

export async function revokeSessionByCookie(cookieValue: string | undefined): Promise<void> {
  if (!cookieValue) return;
  const split = splitCookieValue(cookieValue);
  if (!split) return;
  const db = getDb();
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, split.sessionId));
}
