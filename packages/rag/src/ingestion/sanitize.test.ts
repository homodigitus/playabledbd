import { describe, expect, it } from "vitest";
import { sanitizeErrorMessage } from "./sanitize.js";

describe("sanitizeErrorMessage", () => {
  it("redacts sk- style API keys", () => {
    const message = "Request failed with key sk-abcdefgh12345678 during call.";
    const result = sanitizeErrorMessage(message);
    expect(result).not.toContain("sk-abcdefgh12345678");
    expect(result).toContain("[redacted]");
  });

  it("redacts Bearer tokens", () => {
    const message = "Auth header was Bearer abc12345.token-value and it failed.";
    const result = sanitizeErrorMessage(message);
    expect(result).not.toContain("abc12345.token-value");
    expect(result).toContain("[redacted]");
  });

  it("leaves ordinary messages unchanged", () => {
    const message = "Connection timed out after 30 seconds.";
    expect(sanitizeErrorMessage(message)).toBe(message);
  });

  it("truncates messages longer than 500 chars with a ... suffix", () => {
    const message = "x".repeat(600);
    const result = sanitizeErrorMessage(message);
    expect(result.length).toBe(503);
    expect(result.endsWith("...")).toBe(true);
    expect(result.startsWith("x".repeat(500))).toBe(true);
  });

  it("does not truncate messages at or under 500 chars", () => {
    const message = "y".repeat(500);
    const result = sanitizeErrorMessage(message);
    expect(result).toBe(message);
    expect(result.endsWith("...")).toBe(false);
  });

  it("redacts multiple secrets in the same message", () => {
    const message = "key sk-11111111aaaa then Bearer 22222222bbbb.";
    const result = sanitizeErrorMessage(message);
    expect(result).not.toContain("sk-11111111aaaa");
    expect(result).not.toContain("22222222bbbb");
    expect(result.match(/\[redacted\]/g)?.length).toBe(2);
  });
});
