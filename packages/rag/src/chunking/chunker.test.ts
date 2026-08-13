import { describe, expect, it } from "vitest";
import { chunkDocument, type ChunkOptions } from "./chunker.js";
import type { LoadedDocument } from "../loaders/index.js";
import { countTokens } from "../tokenizer.js";

const MODEL = "text-embedding-3-small";

function doc(blocks: LoadedDocument["blocks"], title = "Doc"): LoadedDocument {
  return { title, blocks };
}

describe("chunkDocument", () => {
  it("returns a single chunk for a small document", () => {
    const d = doc([{ text: "A short paragraph that easily fits in one chunk." }]);
    const opts: ChunkOptions = { chunkSizeTokens: 500, chunkOverlapTokens: 50, embeddingModel: MODEL };

    const chunks = chunkDocument(d, opts);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.chunkIndex).toBe(0);
    expect(chunks[0]!.text).toBe("A short paragraph that easily fits in one chunk.");
    expect(chunks[0]!.tokenCount).toBeLessThanOrEqual(opts.chunkSizeTokens);
  });

  it("returns an empty array for a document with no blocks", () => {
    const d = doc([]);
    const opts: ChunkOptions = { chunkSizeTokens: 100, chunkOverlapTokens: 10, embeddingModel: MODEL };

    expect(chunkDocument(d, opts)).toEqual([]);
  });

  it("returns an empty array for a document whose blocks contain only whitespace", () => {
    const d = doc([{ text: "   \n\n   \n\n   " }]);
    const opts: ChunkOptions = { chunkSizeTokens: 100, chunkOverlapTokens: 10, embeddingModel: MODEL };

    expect(chunkDocument(d, opts)).toEqual([]);
  });

  it("packs many paragraphs into multiple chunks, each within the token budget, with sequential indices", () => {
    const paragraphs = [
      "The lighthouse keeper walked along the rocky shore at dawn.",
      "Waves crashed against the ancient stone pier every morning.",
      "Seagulls circled overhead searching for scraps of fish.",
      "The old fisherman mended his nets beside the weathered boat.",
      "Clouds gathered slowly over the distant gray horizon line.",
      "A cold wind carried the scent of salt and rain today."
    ];
    const d = doc([{ text: paragraphs.join("\n\n") }]);
    const maxParaTokens = Math.max(...paragraphs.map((p) => countTokens(p, MODEL)));
    const opts: ChunkOptions = {
      chunkSizeTokens: maxParaTokens * 2,
      chunkOverlapTokens: maxParaTokens,
      embeddingModel: MODEL
    };

    const chunks = chunkDocument(d, opts);

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(opts.chunkSizeTokens);
    }
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });

  it("carries roughly chunkOverlapTokens worth of trailing content into the next chunk", () => {
    const paragraphs = [
      "The lighthouse keeper walked along the rocky shore at dawn.",
      "Waves crashed against the ancient stone pier every morning.",
      "Seagulls circled overhead searching for scraps of fish.",
      "The old fisherman mended his nets beside the weathered boat.",
      "Clouds gathered slowly over the distant gray horizon line.",
      "A cold wind carried the scent of salt and rain today."
    ];
    const d = doc([{ text: paragraphs.join("\n\n") }]);
    const maxParaTokens = Math.max(...paragraphs.map((p) => countTokens(p, MODEL)));
    const opts: ChunkOptions = {
      chunkSizeTokens: maxParaTokens * 2,
      chunkOverlapTokens: maxParaTokens,
      embeddingModel: MODEL
    };

    const chunks = chunkDocument(d, opts);
    expect(chunks.length).toBeGreaterThan(1);

    let sharedParagraphFound = false;
    for (let i = 0; i < chunks.length - 1; i++) {
      const current = chunks[i]!.text;
      const next = chunks[i + 1]!.text;
      if (paragraphs.some((p) => current.includes(p) && next.includes(p))) {
        sharedParagraphFound = true;
        break;
      }
    }
    expect(sharedParagraphFound).toBe(true);
  });

  it("hard-splits a single paragraph larger than the chunk budget instead of exceeding it", () => {
    const bigParagraph = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
    const d = doc([{ text: bigParagraph }]);
    const opts: ChunkOptions = { chunkSizeTokens: 20, chunkOverlapTokens: 5, embeddingModel: MODEL };

    const chunks = chunkDocument(d, opts);

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(opts.chunkSizeTokens);
    }
  });

  it("does not hard-split a paragraph that fits within the budget", () => {
    const d = doc([{ text: "A single normal-sized paragraph." }]);
    const opts: ChunkOptions = { chunkSizeTokens: 100, chunkOverlapTokens: 10, embeddingModel: MODEL };

    const chunks = chunkDocument(d, opts);

    expect(chunks).toHaveLength(1);
  });

  it("propagates sectionTitle and pageNumber from the source block onto each chunk", () => {
    const p1 = "First section content here.";
    const p2 = "Second section content here.";
    const t1 = countTokens(p1, MODEL);
    const d = doc([
      { text: p1, sectionTitle: "Intro", pageNumber: 1 },
      { text: p2, sectionTitle: "Details", pageNumber: 2 }
    ]);
    const opts: ChunkOptions = { chunkSizeTokens: t1, chunkOverlapTokens: 0, embeddingModel: MODEL };

    const chunks = chunkDocument(d, opts);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.sectionTitle).toBe("Intro");
    expect(chunks[0]!.pageNumber).toBe(1);
    expect(chunks[1]!.sectionTitle).toBe("Details");
    expect(chunks[1]!.pageNumber).toBe(2);
  });

  it("assigns sequential chunkIndex values starting at 0", () => {
    const paragraphs = [
      "First bit of content for indexing purposes only.",
      "Second bit of content for indexing purposes only.",
      "Third bit of content for indexing purposes only.",
      "Fourth bit of content for indexing purposes only."
    ];
    const d = doc([{ text: paragraphs.join("\n\n") }]);
    const opts: ChunkOptions = { chunkSizeTokens: 12, chunkOverlapTokens: 2, embeddingModel: MODEL };

    const chunks = chunkDocument(d, opts);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });
});
