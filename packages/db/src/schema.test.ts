import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import {
  documentChunks,
  documents,
  ingestionItems,
  ingestionRuns,
  schemaMigrations,
  searchLogs,
  sessions,
  users
} from "./schema.js";

/**
 * Pure schema sanity checks — no live Postgres connection required. These guard against
 * accidental renames/removals of tables or columns that other packages (api, rag, mcp)
 * import and rely on by name. Anything requiring a real database is covered by
 * apps/api's integration tests, which run against docker-compose's postgres service.
 */

describe("schema", () => {
  it("defines every expected table", () => {
    expect(getTableName(users)).toBe("users");
    expect(getTableName(sessions)).toBe("sessions");
    expect(getTableName(documents)).toBe("documents");
    expect(getTableName(documentChunks)).toBe("document_chunks");
    expect(getTableName(ingestionRuns)).toBe("ingestion_runs");
    expect(getTableName(ingestionItems)).toBe("ingestion_items");
    expect(getTableName(searchLogs)).toBe("search_logs");
    expect(getTableName(schemaMigrations)).toBe("schema_migrations");
  });

  it("users table has auth-critical columns", () => {
    const columns = Object.keys(getTableColumns(users));
    expect(columns).toEqual(
      expect.arrayContaining(["id", "email", "passwordHash", "role", "isActive"])
    );
  });

  it("sessions table stores only a hashed token, never a raw secret", () => {
    const columns = Object.keys(getTableColumns(sessions));
    expect(columns).toContain("tokenHash");
    expect(columns).not.toContain("token");
    expect(columns).not.toContain("secret");
  });

  it("document_chunks carries both a vector embedding and a keyword tsvector column", () => {
    const columns = Object.keys(getTableColumns(documentChunks));
    expect(columns).toEqual(
      expect.arrayContaining(["embedding", "contentTsvector", "documentId", "content"])
    );
  });

  it("documents track content hash and status for repeatable, observable ingestion", () => {
    const columns = Object.keys(getTableColumns(documents));
    expect(columns).toEqual(
      expect.arrayContaining(["contentSha256", "status", "chunkCount", "lastIndexedAt"])
    );
  });

  it("search_logs captures enough to power the admin analytics view", () => {
    const columns = Object.keys(getTableColumns(searchLogs));
    expect(columns).toEqual(
      expect.arrayContaining(["query", "retrievalMode", "latencyMs", "topScore", "answerStatus"])
    );
  });
});
