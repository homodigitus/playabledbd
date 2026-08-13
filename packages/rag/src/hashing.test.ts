import { describe, expect, it } from "vitest";
import { sha256Hex } from "./hashing.js";

describe("sha256Hex", () => {
  it("is deterministic for the same string input", () => {
    expect(sha256Hex("hello world")).toBe(sha256Hex("hello world"));
  });

  it("is deterministic for the same buffer input", () => {
    const buf = Buffer.from("hello world", "utf-8");
    expect(sha256Hex(buf)).toBe(sha256Hex(Buffer.from("hello world", "utf-8")));
  });

  it("produces the same hash for a string and its equivalent buffer", () => {
    const text = "the quick brown fox";
    expect(sha256Hex(text)).toBe(sha256Hex(Buffer.from(text, "utf-8")));
  });

  it("produces different hashes for different inputs", () => {
    expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
  });

  it("produces a 64-character lowercase hex digest", () => {
    const hash = sha256Hex("some data");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes an empty string to the well-known sha256 empty digest", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});
