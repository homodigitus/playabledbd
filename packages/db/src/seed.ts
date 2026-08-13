import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import { getDb, closeDb } from "./client.js";
import { users } from "./schema.js";
import { sql } from "drizzle-orm";

// Anchored to this file's own location (not process.cwd()) so DEMO_ADMIN_EMAIL etc. still load
// correctly when this package is invoked with a different working directory, e.g. via
// `pnpm --filter <pkg> <script>`, which runs with cwd set to that package's own directory.
loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

async function upsertUser(email: string, password: string, name: string, role: "USER" | "ADMIN") {
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);

  await db
    .insert(users)
    .values({ email: normalizedEmail, passwordHash, name, role, isActive: true })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash, name, role, isActive: true, updatedAt: sql`now()` }
    });

  console.log(`[seed] upserted ${role} user: ${normalizedEmail}`);
}

async function main(): Promise<void> {
  const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD ?? "ChangeMe123!";
  const userEmail = process.env.DEMO_USER_EMAIL ?? "user@example.com";
  const userPassword = process.env.DEMO_USER_PASSWORD ?? "ChangeMe123!";

  await upsertUser(adminEmail, adminPassword, "Demo Admin", "ADMIN");
  await upsertUser(userEmail, userPassword, "Demo User", "USER");

  console.log("[seed] done");
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
