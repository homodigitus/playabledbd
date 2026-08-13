import { config as loadDotenv } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Anchored to this file's own location (not process.cwd()) so DATABASE_URL etc. still load
// correctly when this package is invoked with a different working directory, e.g. via
// `pnpm --filter <pkg> <script>`, which runs with cwd set to that package's own directory.
loadDotenv({ path: resolve(__dirname, "../../../.env") });
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

/** Advisory lock key so concurrent `pnpm db:migrate` invocations (e.g. multiple container
 * replicas starting at once) don't race each other applying the same SQL files. */
const MIGRATION_LOCK_KEY = 727_001;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

  try {
    await sql`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`;

    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const applied = new Set(
      (await sql<{ name: string }[]>`SELECT name FROM schema_migrations`).map((r) => r.name)
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] skip (already applied): ${file}`);
        continue;
      }
      const contents = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      console.log(`[migrate] applying: ${file}`);
      await sql.begin(async (tx) => {
        await tx.unsafe(contents);
        await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      });
    }

    console.log("[migrate] done");
  } finally {
    await sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
