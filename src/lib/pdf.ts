import * as pdfjs from "pdfjs-dist";
import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from "pdfjs-dist/types/src/pdf";
import PdfWorker from "pdfjs-dist/build/pdf.worker.mjs?worker";

// Bundle the worker with Vite instead of fetching it from a CDN so the app
// works fully offline and satisfies the strict CSP.
pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

export type { PDFDocumentProxy, PDFPageProxy };
export const { getDocument, TextLayer, OutputScale } = pdfjs;

export interface OutlineNode {
  title: string;
  bold: boolean;
  italic: boolean;
  dest: unknown;
  items: OutlineNode[];
}

export async function loadDocument(data: Uint8Array): Promise<PDFDocumentProxy> {
  // pdf.js transfers the buffer to its worker, so hand it a copy.
  const task = pdfjs.getDocument({ data: data.slice() });
  return task.promise;
}

/** Resolves an outline destination to a zero-based page index. */
export async function destToPageIndex(
  doc: PDFDocumentProxy,
  dest: unknown,
): Promise<number | null> {
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const ref = explicit[0];
    if (typeof ref === "object" && ref !== null) {
      return await doc.getPageIndex(ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0]);
    }
    if (typeof ref === "number") return ref;
    return null;
  } catch {
    return null;
  }
}
