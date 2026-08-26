import { memo, useEffect, useRef, useState } from "react";
import { TextLayer, type PDFDocumentProxy } from "../lib/pdf";
import type { PageViewport } from "pdfjs-dist/types/src/display/display_utils";
import type { Match } from "../lib/search";
import type { Annot, Tool } from "../lib/annots";

export interface PageProps {
  doc: PDFDocumentProxy;
  /** zero-based */
  index: number;
  /** CSS pixel size of the page box at the current zoom */
  cssWidth: number;
  cssHeight: number;
  scale: number;
  /** user rotation, 0/90/180/270, added to the page's own rotation */
  rotation: number;
  visible: boolean;
  matches: Match[];
  currentMatch: Match | null;
  tool: Tool;
  toolColor: string;
  inkWidth: number;
  textSize: number;
  annots: Annot[];
  onAddAnnot: (annot: Annot) => void;
  registerWrap: (index: number, el: HTMLDivElement | null) => void;
  registerViewport: (index: number, viewport: PageViewport | null) => void;
}

function applyHighlights(
  container: HTMLDivElement,
  textDivs: HTMLElement[],
  itemsStr: string[],
  matches: Match[],
  currentMatch: Match | null,
) {
  for (const el of Array.from(container.querySelectorAll("span[data-pl-orig]"))) {
    el.textContent = el.getAttribute("data-pl-orig");
    el.removeAttribute("data-pl-orig");
  }
  const byItem = new Map<number, Match[]>();
  for (const m of matches) {
    const list = byItem.get(m.item) ?? [];
    list.push(m);
    byItem.set(m.item, list);
  }
  for (const [item, list] of byItem) {
    const div = textDivs[item];
    const text = itemsStr[item];
    if (!div || text === undefined) continue;
    div.setAttribute("data-pl-orig", text);
    div.textContent = "";
    let pos = 0;
    for (const m of list.sort((a, b) => a.offset - b.offset)) {
      if (m.offset > pos) div.append(text.slice(pos, m.offset));
      const mark = document.createElement("mark");
      mark.className = "pl-hl";
      const isCurrent =
        currentMatch !== null &&
        currentMatch.item === m.item &&
        currentMatch.offset === m.offset;
      if (isCurrent) mark.classList.add("cur");
      mark.textContent = text.slice(m.offset, m.offset + m.length);
      div.append(mark);
      pos = m.offset + m.length;
    }
    if (pos < text.length) div.append(text.slice(pos));
  }
}

/** Draws pending (unsaved) annotations for this page in CSS space. */
function AnnotOverlay({
  annots,
  viewport,
  cssWidth,
  cssHeight,
}: {
  annots: Annot[];
  viewport: PageViewport;
  cssWidth: number;
  cssHeight: number;
}) {
  const toCss = (x: number, y: number) => viewport.convertToViewportPoint(x, y);
  return (
    <svg className="annot-layer" width={cssWidth} height={cssHeight}>
      {annots.map((a, i) => {
        if (a.kind === "highlight") {
          return a.rects.map(([x, y, w, h], j) => {
            const [x1, y1] = toCss(x, y);
            const [x2, y2] = toCss(x + w, y + h);
            return (
              <rect
                key={`${i}-${j}`}
                x={Math.min(x1, x2)}
                y={Math.min(y1, y2)}
                width={Math.abs(x2 - x1)}
                height={Math.abs(y2 - y1)}
                fill={a.color}
                fillOpacity={0.45}
                style={{ mixBlendMode: "multiply" }}
              />
            );
          });
        }
        if (a.kind === "ink") {
          const pts = a.points.map(([x, y]) => toCss(x, y).join(",")).join(" ");
          return (
            <polyline
              key={i}
              points={pts}
              fill="none"
              stroke={a.color}
              strokeWidth={a.width * viewport.scale}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        if (a.kind === "text") {
          const [cx, cy] = toCss(a.x, a.y);
          return (
            <text key={i} x={cx} y={cy + a.size * viewport.scale} fill={a.color}
              fontSize={a.size * viewport.scale}
              style={{ whiteSpace: "pre", fontFamily: "'Noto Sans JP', sans-serif" }}
            >
              {a.text.split("\n").map((line, j) => (
                <tspan key={j} x={cx} dy={j === 0 ? 0 : a.size * viewport.scale * 1.3}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        }
        return null;
      })}
    </svg>
  );
}

function PageInner(props: PageProps) {
  const {
    doc, index, cssWidth, cssHeight, scale, rotation, visible,
    matches, currentMatch, tool, toolColor, inkWidth, textSize,
    annots, onAddAnnot, registerWrap, registerViewport,
  } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<{ textDivs: HTMLElement[]; itemsStr: string[] } | null>(null);
  const renderedKey = useRef<string>("");
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const draftInkRef = useRef<[number, number][] | null>(null);
  const [, setInkTick] = useState(0);
  const rafRef = useRef(0);
  const [textEditor, setTextEditor] = useState<{ cssX: number; cssY: number } | null>(null);

  useEffect(() => {
    registerWrap(index, wrapRef.current);
    return () => registerWrap(index, null);
  }, [index, registerWrap]);

  useEffect(() => {
    registerViewport(index, viewport);
    return () => registerViewport(index, null);
  }, [index, viewport, registerViewport]);

  // Render / re-render the canvas and text layer when visibility or geometry changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const textContainer = textRef.current;
    if (!visible || !canvas || !textContainer) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const key = `${scale}:${rotation}:${dpr}`;
    if (renderedKey.current === key) return;

    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let textLayer: InstanceType<typeof TextLayer> | null = null;

    (async () => {
      const page = await doc.getPage(index + 1);
      if (cancelled) return;
      const vp = page.getViewport({
        scale,
        rotation: (page.rotate + rotation) % 360,
      });
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      renderTask = page.render({
        canvas,
        viewport: vp,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      try {
        await renderTask.promise;
      } catch {
        return; // cancelled mid-render
      }
      if (cancelled) return;
      setViewport(vp);

      textContainer.textContent = "";
      const textContent = await page.getTextContent();
      if (cancelled) return;
      textLayer = new TextLayer({
        textContentSource: textContent,
        container: textContainer,
        viewport: vp,
      });
      try {
        await textLayer.render();
      } catch {
        return;
      }
      if (cancelled) return;
      layerRef.current = {
        textDivs: textLayer.textDivs,
        itemsStr: textLayer.textContentItemsStr,
      };
      renderedKey.current = key;
      applyHighlights(
        textContainer,
        textLayer.textDivs,
        textLayer.textContentItemsStr,
        matches,
        currentMatch,
      );
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      renderedKey.current = "";
    };
    // matches/currentMatch are applied in a separate effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, index, visible, scale, rotation, cssWidth, cssHeight]);

  useEffect(() => {
    const textContainer = textRef.current;
    const layer = layerRef.current;
    if (!textContainer || !layer) return;
    applyHighlights(textContainer, layer.textDivs, layer.itemsStr, matches, currentMatch);
  }, [matches, currentMatch]);

  // ---- ink drawing ----
  const inkActive = tool === "ink" && viewport !== null;
  const scheduleInkRedraw = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setInkTick((t) => t + 1));
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!inkActive || e.button !== 0) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    try {
      overlayRef.current!.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events have no active pointer */
    }
    draftInkRef.current = [[e.clientX - rect.left, e.clientY - rect.top]];
    scheduleInkRedraw();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!inkActive || !draftInkRef.current) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    draftInkRef.current.push([e.clientX - rect.left, e.clientY - rect.top]);
    scheduleInkRedraw();
  };
  const onPointerUp = () => {
    if (!inkActive || !draftInkRef.current) return;
    const draft = draftInkRef.current;
    if (draft.length > 1 && viewport) {
      const points = draft.map(([x, y]) => {
        const [px, py] = viewport.convertToPdfPoint(x, y);
        return [px, py] as [number, number];
      });
      onAddAnnot({
        kind: "ink",
        page: index,
        color: toolColor,
        width: inkWidth / viewport.scale,
        points,
      });
    }
    draftInkRef.current = null;
    scheduleInkRedraw();
  };

  // ---- text tool ----
  const onOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== "text" || !viewport || textEditor) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    setTextEditor({ cssX: e.clientX - rect.left, cssY: e.clientY - rect.top });
  };
  const commitText = (value: string) => {
    if (textEditor && viewport && value.trim()) {
      const [px, py] = viewport.convertToPdfPoint(textEditor.cssX, textEditor.cssY);
      onAddAnnot({
        kind: "text",
        page: index,
        color: toolColor,
        size: textSize / viewport.scale,
        x: px,
        y: py,
        text: value.replace(/\s+$/, ""),
      });
    }
    setTextEditor(null);
  };

  const overlayInteractive = tool === "ink" || tool === "text";

  return (
    <div
      ref={wrapRef}
      className="page-wrap"
      data-page={index}
      style={{
        width: cssWidth,
        height: cssHeight,
        ["--total-scale-factor" as string]: String(scale),
        ["--scale-round-x" as string]: "1px",
        ["--scale-round-y" as string]: "1px",
      }}
    >
      {visible ? (
        <>
          <canvas ref={canvasRef} className="page-canvas" />
          <div ref={textRef} className="textLayer" data-pl-page={index} />
          {viewport && annots.length > 0 && (
            <AnnotOverlay
              annots={annots}
              viewport={viewport}
              cssWidth={cssWidth}
              cssHeight={cssHeight}
            />
          )}
          <div
            ref={overlayRef}
            className={"tool-overlay" + (overlayInteractive ? " active " + tool : "")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={onOverlayClick}
          >
            {draftInkRef.current && (
              <svg width={cssWidth} height={cssHeight}>
                <polyline
                  points={draftInkRef.current.map((p) => p.join(",")).join(" ")}
                  fill="none"
                  stroke={toolColor}
                  strokeWidth={inkWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {textEditor && (
              <textarea
                className="text-annot-editor"
                style={{
                  left: textEditor.cssX,
                  top: textEditor.cssY,
                  fontSize: textSize,
                  color: toolColor,
                }}
                autoFocus
                placeholder="Type text"
                onBlur={(e) => commitText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setTextEditor(null);
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    commitText((e.target as HTMLTextAreaElement).value);
                  }
                }}
              />
            )}
          </div>
        </>
      ) : (
        <div className="page-loading">{index + 1}</div>
      )}
    </div>
  );
}

export const Page = memo(PageInner);
