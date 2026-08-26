import type { PDFDocumentProxy } from "./pdf";

/**
 * Renders every page into an image inside #print-root and opens the print
 * dialog. Rendering at ~150 DPI keeps output crisp without exhausting memory.
 */
export async function printDocument(doc: PDFDocumentProxy): Promise<void> {
  const root = document.getElementById("print-root");
  if (!root) return;
  root.textContent = "";
  const scale = 150 / 72;
  const canvas = document.createElement("canvas");
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport, intent: "print" }).promise;
    const img = document.createElement("img");
    img.src = canvas.toDataURL("image/jpeg", 0.92);
    root.append(img);
  }
  canvas.width = 0;
  await new Promise((r) => setTimeout(r, 50));
  window.print();
  setTimeout(() => {
    root.textContent = "";
  }, 1000);
}
