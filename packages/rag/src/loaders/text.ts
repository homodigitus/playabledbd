import { normalizeText } from "./normalize.js";

export type LoadedBlock = {
  text: string;
  pageNumber?: number;
  sectionTitle?: string;
};

export type LoadedDocument = {
  title: string;
  blocks: LoadedBlock[];
};

export function titleFromFileName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^./]+$/, "");
  return withoutExt
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Splits markdown/text into sections on ATX headings (# .. ######), keeping the heading text as
 * `sectionTitle` metadata for citations. Falls back to a single block for heading-less files. */
export function loadTextDocument(fileName: string, raw: string): LoadedDocument {
  const normalized = normalizeText(raw);
  const lines = normalized.split("\n");

  const blocks: LoadedBlock[] = [];
  let currentTitle: string | undefined;
  let currentLines: string[] = [];
  let firstH1: string | undefined;

  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (text.length > 0) {
      blocks.push({ text, sectionTitle: currentTitle });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flush();
      const level = headingMatch[1]!.length;
      const headingText = headingMatch[2]!.trim();
      if (level === 1 && !firstH1) firstH1 = headingText;
      currentTitle = headingText;
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (blocks.length === 0) {
    return { title: titleFromFileName(fileName), blocks: [] };
  }

  return {
    title: firstH1 ?? titleFromFileName(fileName),
    blocks
  };
}
