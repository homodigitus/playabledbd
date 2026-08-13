import { describe, expect, it } from "vitest";
import {
  documentDetailResponseSchema,
  documentDtoSchema,
  documentListQuerySchema,
  documentListResponseSchema
} from "./documents.js";

describe("documentDtoSchema", () => {
  const validDocument = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    sourceKey: "docs/design.pdf",
    title: "Playable Design Doc",
    fileName: "design.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    status: "INDEXED",
    chunkCount: 5,
    lastIndexedAt: "2024-01-01T00:00:00.000Z",
    errorMessage: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z"
  };

  it("accepts a well-formed document", () => {
    const result = documentDtoSchema.safeParse(validDocument);
    expect(result.success).toBe(true);
  });

  it("accepts null lastIndexedAt and errorMessage", () => {
    const result = documentDtoSchema.safeParse({ ...validDocument, lastIndexedAt: null, errorMessage: "boom" });
    expect(result.success).toBe(true);
  });

  it("rejects each of the valid DOCUMENT_STATUSES", () => {
    for (const status of ["PENDING", "PROCESSING", "INDEXED", "FAILED", "REMOVED"]) {
      const result = documentDtoSchema.safeParse({ ...validDocument, status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid status", () => {
    const result = documentDtoSchema.safeParse({ ...validDocument, status: "DELETED" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative sizeBytes", () => {
    const result = documentDtoSchema.safeParse({ ...validDocument, sizeBytes: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer chunkCount", () => {
    const result = documentDtoSchema.safeParse({ ...validDocument, chunkCount: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects undefined for a nullable field (must be explicit null)", () => {
    const { errorMessage: _errorMessage, ...withoutErrorMessage } = validDocument;
    const result = documentDtoSchema.safeParse(withoutErrorMessage);
    expect(result.success).toBe(false);
  });
});

describe("documentDetailResponseSchema", () => {
  const validDocument = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    sourceKey: "docs/design.pdf",
    title: "Playable Design Doc",
    fileName: "design.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    status: "INDEXED",
    chunkCount: 1,
    lastIndexedAt: null,
    errorMessage: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z"
  };

  const validChunk = {
    id: "223e4567-e89b-12d3-a456-426614174000",
    chunkIndex: 0,
    snippet: "some text",
    tokenCount: 10
  };

  it("accepts a well-formed detail response", () => {
    const result = documentDetailResponseSchema.safeParse({ document: validDocument, chunks: [validChunk] });
    expect(result.success).toBe(true);
  });

  it("accepts optional pageNumber and sectionTitle on chunks", () => {
    const result = documentDetailResponseSchema.safeParse({
      document: validDocument,
      chunks: [{ ...validChunk, pageNumber: 2, sectionTitle: "Intro" }]
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty chunks array", () => {
    const result = documentDetailResponseSchema.safeParse({ document: validDocument, chunks: [] });
    expect(result.success).toBe(true);
  });

  it("rejects a negative chunkIndex", () => {
    const result = documentDetailResponseSchema.safeParse({
      document: validDocument,
      chunks: [{ ...validChunk, chunkIndex: -1 }]
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid nested document", () => {
    const result = documentDetailResponseSchema.safeParse({
      document: { ...validDocument, status: "UNKNOWN" },
      chunks: [validChunk]
    });
    expect(result.success).toBe(false);
  });
});

describe("documentListQuerySchema", () => {
  it("applies defaults for page and pageSize when omitted", () => {
    const result = documentListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.search).toBeUndefined();
      expect(result.data.status).toBeUndefined();
    }
  });

  it("coerces string page and pageSize to numbers", () => {
    const result = documentListQuerySchema.safeParse({ page: "3", pageSize: "50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.pageSize).toBe(50);
      expect(typeof result.data.page).toBe("number");
      expect(typeof result.data.pageSize).toBe("number");
    }
  });

  it("accepts an explicit page overriding the default", () => {
    const result = documentListQuerySchema.safeParse({ page: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(5);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it("rejects page below the min of 1", () => {
    const result = documentListQuerySchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts pageSize exactly at the max of 100", () => {
    const result = documentListQuerySchema.safeParse({ pageSize: 100 });
    expect(result.success).toBe(true);
  });

  it("rejects pageSize over the max of 100", () => {
    const result = documentListQuerySchema.safeParse({ pageSize: 101 });
    expect(result.success).toBe(false);
  });

  it("rejects pageSize below the min of 1", () => {
    const result = documentListQuerySchema.safeParse({ pageSize: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts search up to the 200 character max and trims it", () => {
    const result = documentListQuerySchema.safeParse({ search: `  ${"a".repeat(200)}  ` });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.search).toBe("a".repeat(200));
    }
  });

  it("rejects search over the 200 character max", () => {
    const result = documentListQuerySchema.safeParse({ search: "a".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("accepts a valid status filter", () => {
    const result = documentListQuerySchema.safeParse({ status: "FAILED" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status filter", () => {
    const result = documentListQuerySchema.safeParse({ status: "UNKNOWN" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric page string", () => {
    const result = documentListQuerySchema.safeParse({ page: "not-a-number" });
    expect(result.success).toBe(false);
  });
});

describe("documentListResponseSchema", () => {
  const validDocument = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    sourceKey: "docs/design.pdf",
    title: "Playable Design Doc",
    fileName: "design.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    status: "INDEXED",
    chunkCount: 1,
    lastIndexedAt: null,
    errorMessage: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z"
  };

  it("accepts a well-formed list response", () => {
    const result = documentListResponseSchema.safeParse({
      documents: [validDocument],
      total: 1,
      page: 1,
      pageSize: 20
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty documents array", () => {
    const result = documentListResponseSchema.safeParse({ documents: [], total: 0, page: 1, pageSize: 20 });
    expect(result.success).toBe(true);
  });

  it("does not coerce page/pageSize (unlike the query schema) and rejects strings", () => {
    const result = documentListResponseSchema.safeParse({
      documents: [],
      total: 0,
      page: "1",
      pageSize: "20"
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative total", () => {
    const result = documentListResponseSchema.safeParse({ documents: [], total: -1, page: 1, pageSize: 20 });
    expect(result.success).toBe(false);
  });
});
