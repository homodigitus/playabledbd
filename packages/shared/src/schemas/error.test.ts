import { describe, expect, it } from "vitest";
import { apiErrorBodySchema } from "./error.js";

describe("apiErrorBodySchema", () => {
  const validBody = {
    error: {
      code: "NOT_FOUND",
      message: "The resource was not found.",
      requestId: "req-1"
    }
  };

  it("accepts a well-formed error body without optional details", () => {
    const result = apiErrorBodySchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it("accepts arbitrary details when present, since it is z.unknown()", () => {
    const result = apiErrorBodySchema.safeParse({
      error: { ...validBody.error, details: { field: "email", reason: "invalid" } }
    });
    expect(result.success).toBe(true);
  });

  it("accepts primitive and null details values, since z.unknown() imposes no shape", () => {
    expect(apiErrorBodySchema.safeParse({ error: { ...validBody.error, details: "a string" } }).success).toBe(
      true
    );
    expect(apiErrorBodySchema.safeParse({ error: { ...validBody.error, details: null } }).success).toBe(true);
    expect(apiErrorBodySchema.safeParse({ error: { ...validBody.error, details: 42 } }).success).toBe(true);
  });

  it("rejects a missing code field", () => {
    const { code: _code, ...withoutCode } = validBody.error;
    const result = apiErrorBodySchema.safeParse({ error: withoutCode });
    expect(result.success).toBe(false);
  });

  it("rejects a missing message field", () => {
    const { message: _message, ...withoutMessage } = validBody.error;
    const result = apiErrorBodySchema.safeParse({ error: withoutMessage });
    expect(result.success).toBe(false);
  });

  it("rejects a missing requestId field", () => {
    const { requestId: _requestId, ...withoutRequestId } = validBody.error;
    const result = apiErrorBodySchema.safeParse({ error: withoutRequestId });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string code", () => {
    const result = apiErrorBodySchema.safeParse({ error: { ...validBody.error, code: 404 } });
    expect(result.success).toBe(false);
  });

  it("rejects a missing top-level error field", () => {
    const result = apiErrorBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
