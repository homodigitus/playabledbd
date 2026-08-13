import { describe, expect, it } from "vitest";
import { countTokens, decodeTokens, encodeTokens } from "./tokenizer.js";

describe("countTokens", () => {
  it("returns 0 for an empty string", () => {
    expect(countTokens("", "gpt-4o")).toBe(0);
  });

  it("returns a positive count for non-empty text", () => {
    expect(countTokens("hello world", "gpt-4o")).toBeGreaterThan(0);
  });

  it("counts tokens for an embedding model", () => {
    expect(countTokens("hello world", "text-embedding-3-small")).toBeGreaterThan(0);
  });

  it("counts tokens for a chat model routed through a different encoding", () => {
    expect(countTokens("hello world", "gpt-4o")).toBeGreaterThan(0);
  });

  it("falls back to cl100k_base for an unknown model without throwing", () => {
    expect(() => countTokens("hello world", "some-unknown-model")).not.toThrow();
    expect(countTokens("hello world", "some-unknown-model")).toBe(
      countTokens("hello world", "text-embedding-3-small")
    );
  });
});

describe("encodeTokens / decodeTokens", () => {
  it("round-trips text through encode -> decode for a known model", () => {
    const text = "The quick brown fox jumps over the lazy dog.";
    const tokens = encodeTokens(text, "gpt-4o");
    expect(decodeTokens(tokens, "gpt-4o")).toBe(text);
  });

  it("round-trips text for an embedding model", () => {
    const text = "Interactive ads rely on lightweight playable builds.";
    const tokens = encodeTokens(text, "text-embedding-3-small");
    expect(decodeTokens(tokens, "text-embedding-3-small")).toBe(text);
  });

  it("round-trips an empty string", () => {
    const tokens = encodeTokens("", "gpt-4o");
    expect(tokens.length).toBe(0);
    expect(decodeTokens(tokens, "gpt-4o")).toBe("");
  });

  it("encode produces a Uint32Array", () => {
    const tokens = encodeTokens("hello", "gpt-4o");
    expect(tokens).toBeInstanceOf(Uint32Array);
  });

  it("decode accepts a plain number array as well as a Uint32Array", () => {
    const tokens = encodeTokens("hello there", "gpt-4o");
    const asArray = Array.from(tokens);
    expect(decodeTokens(asArray, "gpt-4o")).toBe(decodeTokens(tokens, "gpt-4o"));
  });

  it("falls back gracefully for an unknown model, matching the cl100k_base encoding", () => {
    const text = "fallback behavior check";
    const unknownTokens = encodeTokens(text, "totally-unknown-model");
    const knownTokens = encodeTokens(text, "text-embedding-ada-002");
    expect(Array.from(unknownTokens)).toEqual(Array.from(knownTokens));
    expect(decodeTokens(unknownTokens, "totally-unknown-model")).toBe(text);
  });
});
