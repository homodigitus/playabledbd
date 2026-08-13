import pdfParse from "pdf-parse";
import { normalizeText } from "./normalize.js";
import { titleFromFileName, type LoadedDocument } from "./text.js";

interface PdfPageTextContentItem {
  str: string;
}
interface PdfPageData {
  getTextContent(): Promise<{ items: PdfPageTextContentItem[] }>;
}

export async function loadPdfDocument(fileName: string, buffer: Buffer): Promise<LoadedDocument> {
  const pages: { pageNumber: number; text: string }[] = [];
  let pageCounter = 0;

  await pdfParse(buffer, {
    pagerender: async (pageData: PdfPageData) => {
      pageCounter += 1;
      const textContent = await pageData.getTextContent();
      const text = textContent.items.map((item) => item.str).join(" ");
      pages.push({ pageNumber: pageCounter, text });
      return text;
    }
  });

  const blocks = pages
    .map((p) => ({ text: normalizeText(p.text), pageNumber: p.pageNumber }))
    .filter((b) => b.text.length > 0);

  return { title: titleFromFileName(fileName), blocks };
}
