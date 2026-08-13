import { describe, expect, it } from "vitest";
import { recentSearchesResponseSchema, recentSearchLogSchema, statsOverviewResponseSchema } from "./admin.js";

describe("statsOverviewResponseSchema", () => {
  const validStats = {
    documents: { total: 10, indexed: 8, failed: 1, pending: 1, removed: 0 },
    chunks: { total: 100 },
    lastIngestion: {
      id: "123e4567-e89b-12d3-a456-426614174000",
      status: "SUCCEEDED",
      finishedAt: "2024-01-01T00:00:00.000Z"
    },
    search: {
      last24h: 5,
      last7d: 20,
      avgLatencyMs: 120.5,
      p95LatencyMs: 300,
      avgResultCount: 4.2,
      insufficientContextRate: 0.15
    },
    readiness: { databaseOk: true, pgvectorOk: true }
  };

  it("accepts a well-formed stats overview", () => {
    const result = statsOverviewResponseSchema.safeParse(validStats);
    expect(result.success).toBe(true);
  });

  it("accepts a null lastIngestion when no run has occurred", () => {
    const result = statsOverviewResponseSchema.safeParse({ ...validStats, lastIngestion: null });
    expect(result.success).toBe(true);
  });

  it("accepts insufficientContextRate at the 0 and 1 boundaries", () => {
    expect(
      statsOverviewResponseSchema.safeParse({
        ...validStats,
        search: { ...validStats.search, insufficientContextRate: 0 }
      }).success
    ).toBe(true);
    expect(
      statsOverviewResponseSchema.safeParse({
        ...validStats,
        search: { ...validStats.search, insufficientContextRate: 1 }
      }).success
    ).toBe(true);
  });

  it("rejects insufficientContextRate below 0", () => {
    const result = statsOverviewResponseSchema.safeParse({
      ...validStats,
      search: { ...validStats.search, insufficientContextRate: -0.1 }
    });
    expect(result.success).toBe(false);
  });

  it("rejects insufficientContextRate above 1", () => {
    const result = statsOverviewResponseSchema.safeParse({
      ...validStats,
      search: { ...validStats.search, insufficientContextRate: 1.1 }
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative document count", () => {
    const result = statsOverviewResponseSchema.safeParse({
      ...validStats,
      documents: { ...validStats.documents, total: -1 }
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative latency value", () => {
    const result = statsOverviewResponseSchema.safeParse({
      ...validStats,
      search: { ...validStats.search, avgLatencyMs: -1 }
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing readiness field", () => {
    const { readiness: _readiness, ...withoutReadiness } = validStats;
    const result = statsOverviewResponseSchema.safeParse(withoutReadiness);
    expect(result.success).toBe(false);
  });

  it("rejects a non-boolean readiness field", () => {
    const result = statsOverviewResponseSchema.safeParse({
      ...validStats,
      readiness: { databaseOk: "yes", pgvectorOk: true }
    });
    expect(result.success).toBe(false);
  });
});

describe("recentSearchLogSchema", () => {
  const validLog = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    query: "playable ads",
    retrievalMode: "hybrid",
    resultCount: 5,
    latencyMs: 80,
    answerStatus: "ANSWERED",
    createdAt: "2024-01-01T00:00:00.000Z"
  };

  it("accepts a well-formed search log", () => {
    const result = recentSearchLogSchema.safeParse(validLog);
    expect(result.success).toBe(true);
  });

  it("rejects a negative resultCount", () => {
    const result = recentSearchLogSchema.safeParse({ ...validLog, resultCount: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer resultCount", () => {
    const result = recentSearchLogSchema.safeParse({ ...validLog, resultCount: 2.5 });
    expect(result.success).toBe(false);
  });

  it("rejects a negative latencyMs", () => {
    const result = recentSearchLogSchema.safeParse({ ...validLog, latencyMs: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid id", () => {
    const result = recentSearchLogSchema.safeParse({ ...validLog, id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { query: _query, ...withoutQuery } = validLog;
    const result = recentSearchLogSchema.safeParse(withoutQuery);
    expect(result.success).toBe(false);
  });
});

describe("recentSearchesResponseSchema", () => {
  const validLog = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    query: "playable ads",
    retrievalMode: "hybrid",
    resultCount: 5,
    latencyMs: 80,
    answerStatus: "ANSWERED",
    createdAt: "2024-01-01T00:00:00.000Z"
  };

  it("accepts a well-formed searches list", () => {
    const result = recentSearchesResponseSchema.safeParse({ searches: [validLog] });
    expect(result.success).toBe(true);
  });

  it("accepts an empty searches array", () => {
    const result = recentSearchesResponseSchema.safeParse({ searches: [] });
    expect(result.success).toBe(true);
  });

  it("rejects a searches array with an invalid item", () => {
    const result = recentSearchesResponseSchema.safeParse({ searches: [{ ...validLog, resultCount: -1 }] });
    expect(result.success).toBe(false);
  });
});
