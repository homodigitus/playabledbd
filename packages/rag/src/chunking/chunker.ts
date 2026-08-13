import { countTokens, decodeTokens, encodeTokens } from "../tokenizer.js";
import type { LoadedDocument } from "../loaders/index.js";

export type ChunkDraft = {
  chunkIndex: number;
  text: string;
  tokenCount: number;
  sectionTitle?: string;
  pageNumber?: number;
};

type Paragraph = {
  text: string;
  sectionTitle?: string;
  pageNumber?: number;
};

export type ChunkOptions = {
  chunkSizeTokens: number;
  chunkOverlapTokens: number;
  embeddingModel: string;
};

function splitLargeParagraph(para: Paragraph, opts: ChunkOptions): Paragraph[] {
  const tokens = encodeTokens(para.text, opts.embeddingModel);
  const step = Math.max(opts.chunkSizeTokens - opts.chunkOverlapTokens, 1);
  const out: Paragraph[] = [];

  for (let start = 0; start < tokens.length; start += step) {
    const slice = tokens.slice(start, start + opts.chunkSizeTokens);
    out.push({
      text: decodeTokens(slice, opts.embeddingModel),
      sectionTitle: para.sectionTitle,
      pageNumber: para.pageNumber
    });
    if (start + opts.chunkSizeTokens >= tokens.length) break;
  }
  return out;
}

/** Recursive/structure-aware packing: paragraphs (and headings, which stay attached to the
 * paragraph that follows them) are packed greedily up to chunkSizeTokens, carrying the last
 * chunkOverlapTokens worth of trailing paragraphs into the next chunk so a chunk boundary never
 * fully severs the sentence before it. Oversized single paragraphs fall back to a hard token
 * split so no chunk ever exceeds the configured budget. */
function packParagraphs(paragraphs: Paragraph[], opts: ChunkOptions): Paragraph[] {
  const chunks: Paragraph[] = [];
  let buffer: Paragraph[] = [];
  let bufferTokens = 0;

  const finalizeBuffer = () => {
    if (buffer.length === 0) return;
    const first = buffer[0]!;
    chunks.push({
      text: buffer.map((p) => p.text).join("\n\n"),
      sectionTitle: first.sectionTitle,
      pageNumber: first.pageNumber
    });
  };

  const overlapTail = (): Paragraph[] => {
    if (opts.chunkOverlapTokens <= 0) return [];
    const tail: Paragraph[] = [];
    let tokens = 0;
    for (let i = buffer.length - 1; i >= 0; i--) {
      const p = buffer[i]!;
      const t = countTokens(p.text, opts.embeddingModel);
      if (tokens > 0 && tokens + t > opts.chunkOverlapTokens) break;
      tail.unshift(p);
      tokens += t;
      if (tokens >= opts.chunkOverlapTokens) break;
    }
    return tail;
  };

  for (const para of paragraphs) {
    const paraTokens = countTokens(para.text, opts.embeddingModel);

    if (paraTokens > opts.chunkSizeTokens) {
      finalizeBuffer();
      buffer = [];
      bufferTokens = 0;
      chunks.push(...splitLargeParagraph(para, opts));
      continue;
    }

    if (bufferTokens + paraTokens > opts.chunkSizeTokens && buffer.length > 0) {
      finalizeBuffer();
      const tail = overlapTail();
      buffer = [...tail];
      bufferTokens = tail.reduce((sum, p) => sum + countTokens(p.text, opts.embeddingModel), 0);
    }

    buffer.push(para);
    bufferTokens += paraTokens;
  }
  finalizeBuffer();

  return chunks;
}

export function chunkDocument(doc: LoadedDocument, opts: ChunkOptions): ChunkDraft[] {
  const paragraphs: Paragraph[] = doc.blocks.flatMap((block) =>
    block.text
      .split(/\n{2,}/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map((text) => ({ text, sectionTitle: block.sectionTitle, pageNumber: block.pageNumber }))
  );

  if (paragraphs.length === 0) return [];

  const drafts = packParagraphs(paragraphs, opts);

  return drafts.map((d, i) => ({
    chunkIndex: i,
    text: d.text,
    tokenCount: countTokens(d.text, opts.embeddingModel),
    sectionTitle: d.sectionTitle,
    pageNumber: d.pageNumber
  }));
}
