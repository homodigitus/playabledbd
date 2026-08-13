import { describe, expect, it } from "vitest";
import { buildQuote, sanitizeCitationMarkers } from "./answer.js";

describe("sanitizeCitationMarkers", () => {
  it("keeps markers whose id is in the valid set", () => {
    const answer = "Fact one [1] and fact two [2].";
    expect(sanitizeCitationMarkers(answer, new Set([1, 2]))).toBe(answer);
  });

  it("strips markers whose id is not in the valid set", () => {
    const answer = "Fact one [1] and fact two [2].";
    expect(sanitizeCitationMarkers(answer, new Set([1]))).toBe("Fact one [1] and fact two .");
  });

  it("handles multiple markers, stripping only the invalid ones", () => {
    expect(sanitizeCitationMarkers("[1][2][3]", new Set([1, 3]))).toBe("[1][3]");
  });

  it("strips all markers when the valid set is empty", () => {
    expect(sanitizeCitationMarkers("See [1] and [2].", new Set())).toBe("See  and .");
  });

  it("leaves non-numeric bracketed text untouched", () => {
    expect(sanitizeCitationMarkers("See [abc] for details.", new Set([1]))).toBe("See [abc] for details.");
  });

  it("leaves text with no markers unchanged", () => {
    expect(sanitizeCitationMarkers("No citations here.", new Set([1]))).toBe("No citations here.");
  });
});

describe("buildQuote", () => {
  it("returns short text trimmed, as-is", () => {
    expect(buildQuote("  Hello world.  ")).toBe("Hello world.");
  });

  it("returns short text with no terminal punctuation trimmed, as-is", () => {
    expect(buildQuote("  Hello world  ")).toBe("Hello world");
  });

  it("cuts at the first sentence terminator when one appears early", () => {
    const content =
      "Short sentence one. This is a much longer second sentence that goes on and on for a while just to pad the length well beyond what is needed for this test to demonstrate cutoff behavior clearly.";
    expect(buildQuote(content)).toBe("Short sentence one.");
  });

  it("cuts at '!' or '?' terminators too", () => {
    expect(buildQuote("Is this working? Yes, definitely, and here is a lot more trailing text.")).toBe(
      "Is this working?"
    );
    expect(buildQuote("Watch out! Followed by additional trailing text that continues on.")).toBe(
      "Watch out!"
    );
  });

  it("falls back to a 200-char slice when there is no punctuation at all", () => {
    const content = Array.from({ length: 50 }, () => "word").join(" ");
    expect(content.length).toBeGreaterThan(220);
    const quote = buildQuote(content);
    expect(quote).toBe(content.slice(0, 200).trim());
    expect(quote.length).toBeLessThanOrEqual(200);
  });

  it("falls back to a 200-char slice when the first terminator is beyond the ~220-char window", () => {
    const filler = Array.from({ length: 60 }, () => "word").join(" ");
    const content = `${filler} ends here.`;
    expect(/^[\s\S]{0,220}?[.!?]/.exec(content)).toBeNull();
    expect(buildQuote(content)).toBe(content.slice(0, 200).trim());
  });
});
