import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 1536);

/** pgvector column: drizzle-orm has no first-class `vector` helper we can pin a version to, so we
 * define the wire format ourselves. Values round-trip as `[1,2,3]` strings via the pg text protocol. */
const vector = (dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(",")}]`;
    },
    fromDriver(value: string): number[] {
      return value
        .slice(1, -1)
        .split(",")
        .filter((v) => v.length > 0)
        .map(Number);
    }
  });

/** Generated column managed entirely by SQL migrations (see migrations/0001_search_indexes.sql). */
const tsvectorColumn = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  }
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("USER"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  emailIdx: uniqueIndex("users_email_idx").on(table.email)
}));

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true })
}, (table) => ({
  tokenHashIdx: uniqueIndex("sessions_token_hash_idx").on(table.tokenHash),
  userIdIdx: index("sessions_user_id_idx").on(table.userId)
}));

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceKey: text("source_key").notNull(),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  contentSha256: text("content_sha256").notNull(),
  status: text("status").notNull().default("PENDING"),
  chunkCount: integer("chunk_count").notNull().default(0),
  lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  sourceKeyIdx: uniqueIndex("documents_source_key_idx").on(table.sourceKey),
  statusIdx: index("documents_status_idx").on(table.status),
  shaIdx: index("documents_sha256_idx").on(table.contentSha256)
}));

export const documentChunks = pgTable("document_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  tokenCount: integer("token_count").notNull(),
  embedding: vector(EMBEDDING_DIMENSIONS)("embedding"),
  contentTsvector: tsvectorColumn("content_tsvector"),
  pageNumber: integer("page_number"),
  sectionTitle: text("section_title"),
  embeddingModel: text("embedding_model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  docChunkIdx: uniqueIndex("document_chunks_doc_chunk_idx").on(table.documentId, table.chunkIndex)
}));

export const ingestionRuns = pgTable("ingestion_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status").notNull().default("QUEUED"),
  triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id),
  sourcePath: text("source_path").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  documentsSeen: integer("documents_seen").notNull().default(0),
  documentsIndexed: integer("documents_indexed").notNull().default(0),
  documentsSkipped: integer("documents_skipped").notNull().default(0),
  documentsFailed: integer("documents_failed").notNull().default(0),
  chunksCreated: integer("chunks_created").notNull().default(0),
  errorSummary: text("error_summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  statusIdx: index("ingestion_runs_status_idx").on(table.status),
  createdAtIdx: index("ingestion_runs_created_at_idx").on(table.createdAt)
}));

export const ingestionItems = pgTable("ingestion_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => ingestionRuns.id, { onDelete: "cascade" }),
  sourceKey: text("source_key").notNull(),
  documentId: uuid("document_id").references(() => documents.id),
  status: text("status").notNull(),
  message: text("message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true })
}, (table) => ({
  runIdIdx: index("ingestion_items_run_id_idx").on(table.runId)
}));

export const searchLogs = pgTable("search_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  principal: text("principal"),
  query: text("query").notNull(),
  retrievalMode: text("retrieval_mode").notNull(),
  topK: integer("top_k").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  resultCount: integer("result_count").notNull(),
  topScore: real("top_score"),
  answerStatus: text("answer_status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  createdAtIdx: index("search_logs_created_at_idx").on(table.createdAt),
  userIdIdx: index("search_logs_user_id_idx").on(table.userId)
}));

export const schemaMigrations = pgTable("schema_migrations", {
  name: text("name").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow()
});

export const sqlNow = sql`now()`;
