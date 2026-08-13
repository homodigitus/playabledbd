import { describe, expect, it } from "vitest";
import { isAuthorized } from "./http.js";

describe("isAuthorized", () => {
  it("rejects when no header is present", () => {
    expect(isAuthorized(undefined, "expected-token")).toBe(false);
  });

  it("rejects a token of a different length than expected (avoids buffer length mismatch throwing)", () => {
    expect(isAuthorized("short", "much-longer-expected-token")).toBe(false);
  });

  it("rejects a same-length but incorrect token", () => {
    expect(isAuthorized("wrong-token-12345", "right-token-67890")).toBe(false);
  });

  it("accepts the exact expected token", () => {
    expect(isAuthorized("correct-horse-battery-staple", "correct-horse-battery-staple")).toBe(true);
  });

  it("rejects an empty header value", () => {
    expect(isAuthorized("", "expected-token")).toBe(false);
  });
});
