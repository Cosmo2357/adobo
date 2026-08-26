/** Pending annotations, held in PDF user-space coordinates until baked. */

export interface HighlightAnnot {
  kind: "highlight";
  page: number;
  color: string;
  /** axis-aligned rects in PDF space: [x, y, w, h] with y = bottom */
  rects: [number, number, number, number][];
}

export interface InkAnnot {
  kind: "ink";
  page: number;
  color: string;
  /** stroke width in PDF units */
  width: number;
  points: [number, number][];
}

export interface TextAnnot {
  kind: "text";
  page: number;
  color: string;
  /** font size in PDF units */
  size: number;
  /** left / baseline-top anchor in PDF space */
  x: number;
  y: number;
  text: string;
}

export type Annot = HighlightAnnot | InkAnnot | TextAnnot;

export type Tool = "select" | "highlight" | "ink" | "text";

export const TOOL_COLORS: Record<Exclude<Tool, "select">, string[]> = {
  highlight: ["#ffe234", "#7cf76a", "#6ecbff", "#ff9ff5"],
  ink: ["#e5252c", "#1b66d1", "#111111", "#0f9d58"],
  text: ["#111111", "#e5252c", "#1b66d1"],
};
