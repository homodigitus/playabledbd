import { describe, expect, it } from "vitest";
import { mcpSearchInputSchema, mcpSearchOutputSchema, mcpSearchResultItemSchema } from "./mcp.js";

describe("mcpSearchInputSchema", () => {
  it("accepts a minimal valid input with only query", () => {
    const result = mcpSearchInputSchema.safeParse({ query: "hello world" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topK).toBeUndefined();
      expect(result.data.mode).toBeUndefined();
    }
  });

  it("trims the query", () => {
    const result = mcpSearchInputSchema.safeParse({ query: "  hi there  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("hi there");
    }
  });

  it("accepts a query exactly at the 2 character minimum", () => {
    const result = mcpSearchInputSchema.safeParse({ query: "hi" });
    expect(result.success).toBe(true);
  });

  it("rejects a query below the 2 character minimum", () => {
    const result = mcpSearchInputSchema.safeParse({ query: "h" });
    expect(result.success).toBe(false);
  });

  it("accepts a query exactly at the 500 character maximum", () => {
    const result = mcpSearchInputSchema.safeParse({ query: "a".repeat(500) });
    expect(result.success).toBe(true);
  });

  it("rejects a query over the 500 character maximum", () => {
    const result = mcpSearchInputSchema.safeParse({ query: "a".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("accepts topK exactly at the max of 10", () => {
    const result = mcpSearchInputSchema.safeParse({ query: "hello world", topK: 10 });
    expect(result.success).toBe(true);
  });

  it("rejects topK over the max of 10", () => {
    const result = mcpSearchInputSchema.safeParse({ query: "hello world", topK: 11 });
    expect(result.success).toBe(false);
  });

  it("rejects topK below the min of 1", () => {
    const result = mcpSearchInputSchema.safeParse({ query: "hello world", topK: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts mode 'vector' and 'hybrid'", () => {
    expect(mcpSearchInputSchema.safeParse({ query: "hello world", mode: "vector" }).success).toBe(true);
    expect(mcpSearchInputSchema.safeParse({ query: "hello world", mode: "hybrid" }).success).toBe(true);
  });

  it("rejects an invalid mode", () => {
    const result = mcpSearchInputSchema.safeParse({ query: "hello world", mode: "keyword" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing query", () => {
    const result = mcpSearchInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("mcpSearchResultItemSchema", () => {
  const validItem = {
    chunkId: "123e4567-e89b-12d3-a456-426614174000",
    documentId: "223e4567-e89b-12d3-a456-426614174000",
    documentTitle: "Playable Design Doc",
    sourceKey: "docs/design.pdf",
    content: "Some chunk content.",
    score: 0.75,
    rank: 1
  };

  it("accepts a well-formed result without optional fields", () => {
    const result = mcpSearchResultItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it("accepts optional pageNumber and sectionTitle when present", () => {
    const result = mcpSearchResultItemSchema.safeParse({ ...validItem, pageNumber: 2, sectionTitle: "Intro" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-positive pageNumber", () => {
    const result = mcpSearchResultItemSchema.safeParse({ ...validItem, pageNumber: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer rank", () => {
    const result = mcpSearchResultItemSchema.safeParse({ ...validItem, rank: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid chunkId", () => {
    const result = mcpSearchResultItemSchema.safeParse({ ...validItem, chunkId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { content: _content, ...withoutContent } = validItem;
    const result = mcpSearchResultItemSchema.safeParse(withoutContent);
    expect(result.success).toBe(false);
  });
});

describe("mcpSearchOutputSchema", () => {
  const validItem = {
    chunkId: "123e4567-e89b-12d3-a456-426614174000",
    documentId: "223e4567-e89b-12d3-a456-426614174000",
    documentTitle: "Playable Design Doc",
    sourceKey: "docs/design.pdf",
    content: "Some chunk content.",
    score: 0.75,
    rank: 1
  };

  it("accepts a well-formed output", () => {
    const result = mcpSearchOutputSchema.safeParse({ results: [validItem], resultCount: 1, requestId: "req-1" });
    expect(result.success).toBe(true);
  });

  it("accepts an empty results array with resultCount 0", () => {
    const result = mcpSearchOutputSchema.safeParse({ results: [], resultCount: 0, requestId: "req-1" });
    expect(result.success).toBe(true);
  });

  it("rejects a negative resultCount", () => {
    const result = mcpSearchOutputSchema.safeParse({ results: [], resultCount: -1, requestId: "req-1" });
    expect(result.success).toBe(false);
  });

  it("rejects a results array containing an invalid item", () => {
    const result = mcpSearchOutputSchema.safeParse({
      results: [{ ...validItem, chunkId: "bad" }],
      resultCount: 1,
      requestId: "req-1"
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing requestId", () => {
    const result = mcpSearchOutputSchema.safeParse({ results: [], resultCount: 0 });
    expect(result.success).toBe(false);
  });
});
