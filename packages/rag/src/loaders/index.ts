import { extname } from "node:path";
import { SUPPORTED_EXTENSIONS } from "@lumen/shared";
import { loadDocxDocument } from "./docx.js";
import { loadPdfDocument } from "./pdf.js";
import { loadTextDocument, type LoadedDocument } from "./text.js";

export type { LoadedBlock, LoadedDocument } from "./text.js";
export { titleFromFileName } from "./text.js";

export function isSupportedExtension(fileName: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extname(fileName).toLowerCase());
}

export async function loadDocument(fileName: string, buffer: Buffer): Promise<LoadedDocument> {
  const ext = extname(fileName).toLowerCase();

  switch (ext) {
    case ".txt":
    case ".md":
      return loadTextDocument(fileName, buffer.toString("utf-8"));
    case ".pdf":
      return loadPdfDocument(fileName, buffer);
    case ".docx":
      return loadDocxDocument(fileName, buffer);
    default:
      throw new Error(`Unsupported file extension: ${ext}`);
  }
}
