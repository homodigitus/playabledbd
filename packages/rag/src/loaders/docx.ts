import mammoth from "mammoth";
import { normalizeText } from "./normalize.js";
import { titleFromFileName, type LoadedDocument } from "./text.js";

export async function loadDocxDocument(fileName: string, buffer: Buffer): Promise<LoadedDocument> {
  const { value } = await mammoth.extractRawText({ buffer });
  const text = normalizeText(value);

  return {
    title: titleFromFileName(fileName),
    blocks: text.length > 0 ? [{ text }] : []
  };
}
