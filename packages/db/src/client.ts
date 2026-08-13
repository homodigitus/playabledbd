import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

// Anchored to this file's own location (not process.cwd()) so DATABASE_URL etc. still load
// correctly when this package is invoked with a different working directory, e.g. via
// `pnpm --filter <pkg> <script>`, which runs with cwd set to that package's own directory.
loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  return url;
}

let _sql: postgres.Sql | undefined;
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getSqlClient(): postgres.Sql {
  if (!_sql) {
    _sql = postgres(getDatabaseUrl(), { max: 10, onnotice: () => {} });
  }
  return _sql;
}

export function getDb() {
  if (!_db) {
    _db = drizzle(getSqlClient(), { schema });
  }
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = undefined;
    _db = undefined;
  }
}

export type Db = ReturnType<typeof getDb>;
