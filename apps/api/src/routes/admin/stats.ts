import { count, desc, eq, gte, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { documentChunks, documents, getDb, getSqlClient, ingestionRuns, searchLogs } from "@lumen/db";
import {
  recentSearchesResponseSchema,
  statsOverviewResponseSchema,
  type RecentSearchesResponse,
  type StatsOverviewResponse
} from "@lumen/shared";
import { requireAdmin } from "../../auth/guards.js";
import { toIso } from "../../util/dto.js";
import { checkDatabaseOk, checkPgvectorOk } from "../../util/readiness.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

export async function registerAdminStatsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/admin/stats/overview", { preHandler: requireAdmin }, async (_request, reply) => {
    const db = getDb();
    const sql = getSqlClient();
    const now = Date.now();
    const oneDayAgo = new Date(now - ONE_DAY_MS);
    const sevenDaysAgo = new Date(now - SEVEN_DAYS_MS);

    const [
      totalRows,
      indexedRows,
      failedRows,
      pendingRows,
      removedRows,
      chunkTotalRows,
      lastRunRows,
      last24hRows,
      last7dRows
    ] = await Promise.all([
      db.select({ value: count() }).from(documents),
      db.select({ value: count() }).from(documents).where(eq(documents.status, "INDEXED")),
      db.select({ value: count() }).from(documents).where(eq(documents.status, "FAILED")),
      db.select({ value: count() }).from(documents).where(inArray(documents.status, ["PENDING", "PROCESSING"])),
      db.select({ value: count() }).from(documents).where(eq(documents.status, "REMOVED")),
      db.select({ value: count() }).from(documentChunks),
      db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.createdAt)).limit(1),
      db.select({ value: count() }).from(searchLogs).where(gte(searchLogs.createdAt, oneDayAgo)),
      db.select({ value: count() }).from(searchLogs).where(gte(searchLogs.createdAt, sevenDaysAgo))
    ]);

    const total = totalRows[0]?.value ?? 0;
    const indexed = indexedRows[0]?.value ?? 0;
    const failed = failedRows[0]?.value ?? 0;
    const pending = pendingRows[0]?.value ?? 0;
    const removed = removedRows[0]?.value ?? 0;
    const chunkTotal = chunkTotalRows[0]?.value ?? 0;
    const last24h = last24hRows[0]?.value ?? 0;
    const last7d = last7dRows[0]?.value ?? 0;

    // Passing a Date directly here (rather than an ISO string) intermittently makes postgres.js
    // mis-infer this bind parameter's type when the connection has already served a Drizzle query
    // in the same request — Postgres reports back a text-like OID and the byte-length encoder then
    // throws on the Date instance. An ISO string always binds unambiguously as timestamptz.
    const sevenDaysAgoIso = sevenDaysAgo.toISOString();
    const aggRows = await sql<
      { avg_latency: number | null; avg_result_count: number | null; insufficient_count: number; total_count: number }[]
    >`
      SELECT
        AVG(latency_ms)::float8 as avg_latency,
        AVG(result_count)::float8 as avg_result_count,
        COUNT(*) FILTER (WHERE answer_status = 'INSUFFICIENT_CONTEXT')::int as insufficient_count,
        COUNT(*)::int as total_count
      FROM search_logs
      WHERE created_at >= ${sevenDaysAgoIso}
    `;
    const p95Rows = await sql<{ p95: number | null }[]>`
      SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float8 as p95
      FROM search_logs
      WHERE created_at >= ${sevenDaysAgoIso}
    `;

    const agg = aggRows[0];
    const insufficientContextRate =
      agg && agg.total_count > 0 ? agg.insufficient_count / agg.total_count : 0;

    const lastRun = lastRunRows[0];
    const [databaseOk, pgvectorOk] = await Promise.all([checkDatabaseOk(), checkPgvectorOk()]);

    const response: StatsOverviewResponse = {
      documents: { total, indexed, failed, pending, removed },
      chunks: { total: chunkTotal },
      lastIngestion: lastRun
        ? { id: lastRun.id, status: lastRun.status, finishedAt: lastRun.finishedAt ? toIso(lastRun.finishedAt) : null }
        : null,
      search: {
        last24h,
        last7d,
        avgLatencyMs: agg?.avg_latency ?? 0,
        p95LatencyMs: p95Rows[0]?.p95 ?? 0,
        avgResultCount: agg?.avg_result_count ?? 0,
        insufficientContextRate
      },
      readiness: { databaseOk, pgvectorOk }
    };

    reply.send(statsOverviewResponseSchema.parse(response));
  });

  fastify.get("/api/admin/stats/recent-searches", { preHandler: requireAdmin }, async (_request, reply) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(searchLogs)
      .orderBy(desc(searchLogs.createdAt))
      .limit(50);

    const response: RecentSearchesResponse = {
      searches: rows.map((r) => ({
        id: r.id,
        query: r.query.length > 200 ? `${r.query.slice(0, 200)}...` : r.query,
        retrievalMode: r.retrievalMode,
        resultCount: r.resultCount,
        latencyMs: r.latencyMs,
        answerStatus: r.answerStatus,
        createdAt: toIso(r.createdAt)
      }))
    };
    reply.send(recentSearchesResponseSchema.parse(response));
  });
}
