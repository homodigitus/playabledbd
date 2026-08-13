import { describe, expect, it } from "vitest";
import {
  ingestionItemDtoSchema,
  ingestionRunDetailResponseSchema,
  ingestionRunDtoSchema,
  ingestionRunListResponseSchema,
  triggerIngestionRequestSchema
} from "./ingestion.js";

describe("ingestionRunDtoSchema", () => {
  const validRun = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    status: "RUNNING",
    triggeredByUserId: "223e4567-e89b-12d3-a456-426614174000",
    sourcePath: "/data/source",
    startedAt: "2024-01-01T00:00:00.000Z",
    finishedAt: null,
    documentsSeen: 10,
    documentsIndexed: 8,
    documentsSkipped: 1,
    documentsFailed: 1,
    chunksCreated: 40,
    errorSummary: null
  };

  it("accepts a well-formed ingestion run", () => {
    const result = ingestionRunDtoSchema.safeParse(validRun);
    expect(result.success).toBe(true);
  });

  it("accepts a null triggeredByUserId (system-triggered run)", () => {
    const result = ingestionRunDtoSchema.safeParse({ ...validRun, triggeredByUserId: null });
    expect(result.success).toBe(true);
  });

  it("accepts each of the valid INGESTION_RUN_STATUSES", () => {
    for (const status of ["QUEUED", "RUNNING", "SUCCEEDED", "PARTIAL", "FAILED"]) {
      const result = ingestionRunDtoSchema.safeParse({ ...validRun, status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid status", () => {
    const result = ingestionRunDtoSchema.safeParse({ ...validRun, status: "CANCELLED" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative documentsSeen", () => {
    const result = ingestionRunDtoSchema.safeParse({ ...validRun, documentsSeen: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer chunksCreated", () => {
    const result = ingestionRunDtoSchema.safeParse({ ...validRun, chunksCreated: 1.2 });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid triggeredByUserId uuid", () => {
    const result = ingestionRunDtoSchema.safeParse({ ...validRun, triggeredByUserId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { sourcePath: _sourcePath, ...withoutSourcePath } = validRun;
    const result = ingestionRunDtoSchema.safeParse(withoutSourcePath);
    expect(result.success).toBe(false);
  });
});

describe("ingestionItemDtoSchema", () => {
  const validItem = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    runId: "223e4567-e89b-12d3-a456-426614174000",
    sourceKey: "docs/design.pdf",
    documentId: "323e4567-e89b-12d3-a456-426614174000",
    status: "INDEXED",
    message: null,
    startedAt: "2024-01-01T00:00:00.000Z",
    finishedAt: "2024-01-01T00:01:00.000Z"
  };

  it("accepts a well-formed ingestion item", () => {
    const result = ingestionItemDtoSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it("accepts a null documentId (not yet linked)", () => {
    const result = ingestionItemDtoSchema.safeParse({ ...validItem, documentId: null });
    expect(result.success).toBe(true);
  });

  it("accepts each of the valid INGESTION_ITEM_STATUSES", () => {
    for (const status of ["PENDING", "INDEXED", "UNCHANGED", "SKIPPED_UNSUPPORTED", "FAILED", "REMOVED"]) {
      const result = ingestionItemDtoSchema.safeParse({ ...validItem, status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid status", () => {
    const result = ingestionItemDtoSchema.safeParse({ ...validItem, status: "UNKNOWN" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid runId", () => {
    const result = ingestionItemDtoSchema.safeParse({ ...validItem, runId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects undefined for a nullable field (must be explicit null)", () => {
    const { message: _message, ...withoutMessage } = validItem;
    const result = ingestionItemDtoSchema.safeParse(withoutMessage);
    expect(result.success).toBe(false);
  });
});

describe("triggerIngestionRequestSchema", () => {
  it("accepts an empty body since sourcePath is optional", () => {
    const result = triggerIngestionRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourcePath).toBeUndefined();
    }
  });

  it("accepts a valid sourcePath and trims it", () => {
    const result = triggerIngestionRequestSchema.safeParse({ sourcePath: "  /data/source  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourcePath).toBe("/data/source");
    }
  });

  it("accepts a sourcePath exactly at the 500 character max", () => {
    const result = triggerIngestionRequestSchema.safeParse({ sourcePath: "a".repeat(500) });
    expect(result.success).toBe(true);
  });

  it("rejects a sourcePath over the 500 character max", () => {
    const result = triggerIngestionRequestSchema.safeParse({ sourcePath: "a".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string sourcePath", () => {
    const result = triggerIngestionRequestSchema.safeParse({ sourcePath: 123 });
    expect(result.success).toBe(false);
  });
});

describe("ingestionRunListResponseSchema", () => {
  const validRun = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    status: "SUCCEEDED",
    triggeredByUserId: null,
    sourcePath: "/data/source",
    startedAt: "2024-01-01T00:00:00.000Z",
    finishedAt: "2024-01-01T00:05:00.000Z",
    documentsSeen: 10,
    documentsIndexed: 10,
    documentsSkipped: 0,
    documentsFailed: 0,
    chunksCreated: 50,
    errorSummary: null
  };

  it("accepts a well-formed run list", () => {
    const result = ingestionRunListResponseSchema.safeParse({ runs: [validRun] });
    expect(result.success).toBe(true);
  });

  it("accepts an empty runs array", () => {
    const result = ingestionRunListResponseSchema.safeParse({ runs: [] });
    expect(result.success).toBe(true);
  });

  it("rejects a runs array with an invalid item", () => {
    const result = ingestionRunListResponseSchema.safeParse({ runs: [{ ...validRun, status: "BAD" }] });
    expect(result.success).toBe(false);
  });
});

describe("ingestionRunDetailResponseSchema", () => {
  const validRun = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    status: "SUCCEEDED",
    triggeredByUserId: null,
    sourcePath: "/data/source",
    startedAt: "2024-01-01T00:00:00.000Z",
    finishedAt: "2024-01-01T00:05:00.000Z",
    documentsSeen: 10,
    documentsIndexed: 10,
    documentsSkipped: 0,
    documentsFailed: 0,
    chunksCreated: 50,
    errorSummary: null
  };

  const validItem = {
    id: "223e4567-e89b-12d3-a456-426614174000",
    runId: "123e4567-e89b-12d3-a456-426614174000",
    sourceKey: "docs/design.pdf",
    documentId: "323e4567-e89b-12d3-a456-426614174000",
    status: "INDEXED",
    message: null,
    startedAt: "2024-01-01T00:00:00.000Z",
    finishedAt: "2024-01-01T00:01:00.000Z"
  };

  it("accepts a well-formed detail response", () => {
    const result = ingestionRunDetailResponseSchema.safeParse({ run: validRun, items: [validItem] });
    expect(result.success).toBe(true);
  });

  it("accepts an empty items array", () => {
    const result = ingestionRunDetailResponseSchema.safeParse({ run: validRun, items: [] });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid nested run", () => {
    const result = ingestionRunDetailResponseSchema.safeParse({
      run: { ...validRun, documentsSeen: -1 },
      items: []
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid nested item", () => {
    const result = ingestionRunDetailResponseSchema.safeParse({
      run: validRun,
      items: [{ ...validItem, status: "BAD" }]
    });
    expect(result.success).toBe(false);
  });
});
