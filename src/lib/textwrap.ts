/**
 * Shared text wrapping so the editor, the SVG overlay and the baked PDF all
 * break lines at the same points. Measurement uses the bundled Noto Sans JP
 * via canvas, in units where 1px at font size N equals 1 PDF unit at size N.
 */

let ctx: CanvasRenderingContext2D | null = null;

export function measureText(text: string, fontPx: number): number {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * fontPx * 0.62;
  ctx.font = `${fontPx}px "Noto Sans JP", sans-serif`;
  return ctx.measureText(text).width;
}

const isCjk = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x3000 && c <= 0x9fff) || // punctuation, kana, CJK ideographs
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xff00 && c <= 0xffef) // full-width forms
  );
};

/** Wraps one paragraph greedily; breaks after spaces or between CJK chars. */
function wrapParagraph(text: string, maxWidth: number, fontPx: number): string[] {
  if (measureText(text, fontPx) <= maxWidth) return [text];
  const lines: string[] = [];
  let line = "";
  let lastBreak = -1; // index in `line` after which we may break
  for (const ch of text) {
    const candidate = line + ch;
    if (line.length > 0 && measureText(candidate, fontPx) > maxWidth) {
      if (lastBreak > 0) {
        lines.push(line.slice(0, lastBreak));
        line = line.slice(lastBreak).trimStart() + ch;
      } else {
        lines.push(line);
        line = ch;
      }
      lastBreak = -1;
      continue;
    }
    line = candidate;
    if (ch === " " || isCjk(ch)) lastBreak = line.length;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

/** Splits on explicit newlines, then wraps each paragraph to maxWidth. */
export function wrapLines(text: string, maxWidth: number, fontPx: number): string[] {
  return text.split("\n").flatMap((p) => (p === "" ? [""] : wrapParagraph(p, maxWidth, fontPx)));
}
