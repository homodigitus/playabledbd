import { describe, expect, it } from "vitest";
import { searchRequestSchema, searchResponseSchema, searchResultSchema } from "./search.js";

describe("searchResultSchema", () => {
  const validResult = {
    chunkId: "123e4567-e89b-12d3-a456-426614174000",
    documentId: "223e4567-e89b-12d3-a456-426614174000",
    documentTitle: "Playable Design Doc",
    sourceKey: "docs/design.pdf",
    snippet: "This is a snippet of text.",
    score: 0.87,
    rank: 1
  };

  it("accepts a well-formed result without optional fields", () => {
    const result = searchResultSchema.safeParse(validResult);
    expect(result.success).toBe(true);
  });

  it("accepts optional pageNumber and sectionTitle when present", () => {
    const result = searchResultSchema.safeParse({ ...validResult, pageNumber: 3, sectionTitle: "Intro" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid chunkId", () => {
    const result = searchResultSchema.safeParse({ ...validResult, chunkId: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive pageNumber", () => {
    const result = searchResultSchema.safeParse({ ...validResult, pageNumber: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer rank", () => {
    const result = searchResultSchema.safeParse({ ...validResult, rank: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive rank", () => {
    const result = searchResultSchema.safeParse({ ...validResult, rank: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { snippet: _snippet, ...withoutSnippet } = validResult;
    const result = searchResultSchema.safeParse(withoutSnippet);
    expect(result.success).toBe(false);
  });
});

describe("searchRequestSchema", () => {
  it("accepts a minimal valid request with only query", () => {
    const result = searchRequestSchema.safeParse({ query: "hello world" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topK).toBeUndefined();
      expect(result.data.mode).toBeUndefined();
    }
  });

  it("trims the query", () => {
    const result = searchRequestSchema.safeParse({ query: "  hi there  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("hi there");
    }
  });

  it("accepts a query exactly at the 2 character minimum", () => {
    const result = searchRequestSchema.safeParse({ query: "hi" });
    expect(result.success).toBe(true);
  });

  it("rejects a query below the 2 character minimum", () => {
    const result = searchRequestSchema.safeParse({ query: "h" });
    expect(result.success).toBe(false);
  });

  it("rejects a query that is only whitespace trimmed below the minimum", () => {
    const result = searchRequestSchema.safeParse({ query: " h " });
    expect(result.success).toBe(false);
  });

  it("accepts a query exactly at the 500 character maximum", () => {
    const result = searchRequestSchema.safeParse({ query: "a".repeat(500) });
    expect(result.success).toBe(true);
  });

  it("rejects a query over the 500 character maximum", () => {
    const result = searchRequestSchema.safeParse({ query: "a".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("accepts topK exactly at the max of 10", () => {
    const result = searchRequestSchema.safeParse({ query: "hello world", topK: 10 });
    expect(result.success).toBe(true);
  });

  it("rejects topK over the max of 10", () => {
    const result = searchRequestSchema.safeParse({ query: "hello world", topK: 11 });
    expect(result.success).toBe(false);
  });

  it("accepts topK exactly at the min of 1", () => {
    const result = searchRequestSchema.safeParse({ query: "hello world", topK: 1 });
    expect(result.success).toBe(true);
  });

  it("rejects topK below the min of 1", () => {
    const result = searchRequestSchema.safeParse({ query: "hello world", topK: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer topK", () => {
    const result = searchRequestSchema.safeParse({ query: "hello world", topK: 5.5 });
    expect(result.success).toBe(false);
  });

  it("accepts mode 'vector' and 'hybrid'", () => {
    expect(searchRequestSchema.safeParse({ query: "hello world", mode: "vector" }).success).toBe(true);
    expect(searchRequestSchema.safeParse({ query: "hello world", mode: "hybrid" }).success).toBe(true);
  });

  it("rejects an invalid mode", () => {
    const result = searchRequestSchema.safeParse({ query: "hello world", mode: "keyword" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing query", () => {
    const result = searchRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("searchResponseSchema", () => {
  const validResult = {
    chunkId: "123e4567-e89b-12d3-a456-426614174000",
    documentId: "223e4567-e89b-12d3-a456-426614174000",
    documentTitle: "Playable Design Doc",
    sourceKey: "docs/design.pdf",
    snippet: "This is a snippet of text.",
    score: 0.87,
    rank: 1
  };

  it("accepts a well-formed response", () => {
    const result = searchResponseSchema.safeParse({
      results: [validResult],
      resultCount: 1,
      requestId: "req-1",
      latencyMs: 42
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty results array with resultCount 0", () => {
    const result = searchResponseSchema.safeParse({
      results: [],
      resultCount: 0,
      requestId: "req-1",
      latencyMs: 0
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative resultCount", () => {
    const result = searchResponseSchema.safeParse({
      results: [],
      resultCount: -1,
      requestId: "req-1",
      latencyMs: 0
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative latencyMs", () => {
    const result = searchResponseSchema.safeParse({
      results: [],
      resultCount: 0,
      requestId: "req-1",
      latencyMs: -5
    });
    expect(result.success).toBe(false);
  });

  it("rejects a results array containing an invalid item", () => {
    const result = searchResponseSchema.safeParse({
      results: [{ ...validResult, chunkId: "bad" }],
      resultCount: 1,
      requestId: "req-1",
      latencyMs: 42
    });
    expect(result.success).toBe(false);
  });
});
