import { BlendMode, LineCapStyle, PDFDocument, rgb, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Annot } from "./annots";

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

let fontBytes: Promise<ArrayBuffer> | null = null;
function loadFontBytes(): Promise<ArrayBuffer> {
  fontBytes ??= fetch("/fonts/NotoSansJP-Regular.otf").then((r) => {
    if (!r.ok) throw new Error(`font fetch failed: ${r.status}`);
    return r.arrayBuffer();
  });
  return fontBytes;
}

/**
 * Bakes pending annotations into the document content so the result renders
 * identically in every viewer.
 */
export async function bakeAnnotations(bytes: Uint8Array, annots: Annot[]): Promise<Uint8Array> {
  if (annots.length === 0) return bytes;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  doc.registerFontkit(fontkit);
  const needsFont = annots.some((a) => a.kind === "text");
  const font = needsFont
    ? await doc.embedFont(await loadFontBytes(), { subset: true })
    : null;
  const pages = doc.getPages();

  for (const a of annots) {
    const page = pages[a.page];
    if (!page) continue;
    if (a.kind === "highlight") {
      for (const [x, y, w, h] of a.rects) {
        page.drawRectangle({
          x,
          y,
          width: w,
          height: h,
          color: hexToRgb(a.color),
          opacity: 0.45,
          blendMode: BlendMode.Multiply,
        });
      }
    } else if (a.kind === "ink") {
      for (let i = 1; i < a.points.length; i++) {
        page.drawLine({
          start: { x: a.points[i - 1][0], y: a.points[i - 1][1] },
          end: { x: a.points[i][0], y: a.points[i][1] },
          thickness: a.width,
          color: hexToRgb(a.color),
          lineCap: LineCapStyle.Round,
        });
      }
    } else if (a.kind === "text" && font) {
      const lines = a.text.split("\n");
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: a.x,
          y: a.y - a.size - i * a.size * 1.3,
          size: a.size,
          font,
          color: hexToRgb(a.color),
        });
      });
    }
  }
  return doc.save();
}

export interface PageEdit {
  /** source page index in the current document */
  source: number;
  /** additional rotation in degrees (multiple of 90) */
  extraRotation: number;
}

/**
 * Rebuilds the document with pages in the given order/rotation. Omitted
 * source pages are dropped.
 */
export async function reorganize(bytes: Uint8Array, order: PageEdit[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, order.map((o) => o.source));
  copied.forEach((page, i) => {
    const extra = order[i].extraRotation % 360;
    if (extra !== 0) {
      page.setRotation(degrees((page.getRotation().angle + extra) % 360));
    }
    out.addPage(page);
  });
  return out.save();
}

/** Extracts the given source pages (with rotation applied) into a new file. */
export async function extractPages(bytes: Uint8Array, order: PageEdit[]): Promise<Uint8Array> {
  return reorganize(bytes, order);
}

/** Inserts every page of `insert` into `base` at position `at`. */
export async function insertDocument(
  base: Uint8Array,
  insert: Uint8Array,
  at: number,
): Promise<Uint8Array> {
  const dst = await PDFDocument.load(base);
  const src = await PDFDocument.load(insert);
  const pages = await dst.copyPages(src, src.getPageIndices());
  pages.forEach((p, i) => dst.insertPage(at + i, p));
  return dst.save();
}
