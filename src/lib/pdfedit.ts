import { BlendMode, LineCapStyle, PDFDocument, rgb, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Annot } from "./annots";
import { wrapLines } from "./textwrap";

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
      const lines = a.width
        ? wrapLines(a.text, a.width, a.size)
        : a.text.split("\n");
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: a.x,
          y: a.y - a.size * 1.15 - i * a.size * 1.3,
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

export const PAGE_SIZES: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

/** Creates a new document with the given number of blank pages. */
export async function createBlankPdf(
  pages = 1,
  size: [number, number] = PAGE_SIZES.a4,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([size[0], size[1]]);
  return doc.save();
}

/**
 * Inserts one blank page at `at`, sized to match its neighbour so mixed-size
 * documents keep their local page format.
 */
export async function insertBlankPage(bytes: Uint8Array, at: number): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const ref = pages[Math.min(Math.max(at - 1, 0), pages.length - 1)];
  const size: [number, number] = ref
    ? [ref.getWidth(), ref.getHeight()]
    : PAGE_SIZES.a4;
  doc.insertPage(Math.min(at, pages.length), size);
  return doc.save();
}

/**
 * Builds a document from images, one page per image, each page sized to its
 * image at 72 dpi (capped to A4 width scale for huge photos kept as-is —
 * viewers scale pages, so native size is fine).
 */
export async function imagesToPdf(
  images: { bytes: Uint8Array; type: "jpg" | "png" }[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const img of images) {
    const embedded =
      img.type === "jpg" ? await doc.embedJpg(img.bytes) : await doc.embedPng(img.bytes);
    const page = doc.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: embedded.width,
      height: embedded.height,
    });
  }
  return doc.save();
}
