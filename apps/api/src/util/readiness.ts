import { getSqlClient } from "@lumen/db";

export async function checkDatabaseOk(): Promise<boolean> {
  try {
    const sql = getSqlClient();
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function checkPgvectorOk(): Promise<boolean> {
  try {
    const sql = getSqlClient();
    const rows = await sql<{ exists: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') as exists
    `;
    return rows[0]?.exists === true;
  } catch {
    return false;
  }
}
