import { describe, expect, it } from "vitest";
import { askRequestSchema, askResponseSchema, citationSchema } from "./ask.js";

describe("askRequestSchema", () => {
  it("is an alias of searchRequestSchema and accepts a valid query", () => {
    const result = askRequestSchema.safeParse({ query: "what is the meaning of this" });
    expect(result.success).toBe(true);
  });

  it("rejects a query below the 2 character minimum, same as searchRequestSchema", () => {
    const result = askRequestSchema.safeParse({ query: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing query", () => {
    const result = askRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("citationSchema", () => {
  const validCitation = {
    id: 1,
    documentId: "123e4567-e89b-12d3-a456-426614174000",
    documentTitle: "Playable Design Doc",
    sourceKey: "docs/design.pdf",
    chunkId: "223e4567-e89b-12d3-a456-426614174000"
  };

  it("accepts a well-formed citation without optional fields", () => {
    const result = citationSchema.safeParse(validCitation);
    expect(result.success).toBe(true);
  });

  it("accepts optional pageNumber, sectionTitle, and quote when present", () => {
    const result = citationSchema.safeParse({
      ...validCitation,
      pageNumber: 4,
      sectionTitle: "Chapter 1",
      quote: "an exact quote"
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-integer id", () => {
    const result = citationSchema.safeParse({ ...validCitation, id: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive id", () => {
    const result = citationSchema.safeParse({ ...validCitation, id: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive pageNumber", () => {
    const result = citationSchema.safeParse({ ...validCitation, pageNumber: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid documentId uuid", () => {
    const result = citationSchema.safeParse({ ...validCitation, documentId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { sourceKey: _sourceKey, ...withoutSourceKey } = validCitation;
    const result = citationSchema.safeParse(withoutSourceKey);
    expect(result.success).toBe(false);
  });
});

describe("askResponseSchema", () => {
  const validCitation = {
    id: 1,
    documentId: "123e4567-e89b-12d3-a456-426614174000",
    documentTitle: "Playable Design Doc",
    sourceKey: "docs/design.pdf",
    chunkId: "223e4567-e89b-12d3-a456-426614174000"
  };

  const validResult = {
    chunkId: "223e4567-e89b-12d3-a456-426614174000",
    documentId: "123e4567-e89b-12d3-a456-426614174000",
    documentTitle: "Playable Design Doc",
    sourceKey: "docs/design.pdf",
    snippet: "This is a snippet of text.",
    score: 0.9,
    rank: 1
  };

  const baseResponse = {
    answer: "The answer is 42.",
    status: "answered",
    citations: [validCitation],
    results: [validResult],
    requestId: "req-1",
    latencyMs: 100
  };

  it("accepts a well-formed 'answered' response", () => {
    const result = askResponseSchema.safeParse(baseResponse);
    expect(result.success).toBe(true);
  });

  it("accepts status 'insufficient_context'", () => {
    const result = askResponseSchema.safeParse({ ...baseResponse, status: "insufficient_context" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    const result = askResponseSchema.safeParse({ ...baseResponse, status: "error" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative latencyMs", () => {
    const result = askResponseSchema.safeParse({ ...baseResponse, latencyMs: -1 });
    expect(result.success).toBe(false);
  });

  it("accepts empty citations and results arrays", () => {
    const result = askResponseSchema.safeParse({ ...baseResponse, citations: [], results: [] });
    expect(result.success).toBe(true);
  });

  it("rejects a citations array containing an invalid citation", () => {
    const result = askResponseSchema.safeParse({
      ...baseResponse,
      citations: [{ ...validCitation, documentId: "bad" }]
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing answer field", () => {
    const { answer: _answer, ...withoutAnswer } = baseResponse;
    const result = askResponseSchema.safeParse(withoutAnswer);
    expect(result.success).toBe(false);
  });
});
