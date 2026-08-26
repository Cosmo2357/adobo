import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PDFDocumentProxy } from "../lib/pdf";
import type { Match } from "../lib/search";
import type { Annot, Tool } from "../lib/annots";
import type { PageViewport } from "pdfjs-dist/types/src/display/display_utils";
import { Page } from "./Page";

export type ZoomMode = "fit-width" | "fit-page" | "custom";

export interface Zoom {
  mode: ZoomMode;
  scale: number;
}

export interface PageDims {
  /** scale-1 viewport size with the page's own rotation applied */
  width: number;
  height: number;
}

export interface ViewerHandle {
  scrollToPage: (index: number) => void;
  scrollToMatch: (match: Match) => void;
}

interface ViewerProps {
  doc: PDFDocumentProxy;
  dims: PageDims[];
  zoom: Zoom;
  rotation: number;
  matches: Match[];
  currentMatch: Match | null;
  tool: Tool;
  toolColor: string;
  inkWidth: number;
  textSize: number;
  annots: Annot[];
  selectedAnnotId: number | null;
  onAddAnnot: (annot: Annot) => void;
  onSelectAnnot: (id: number | null) => void;
  onMoveAnnot: (id: number, dx: number, dy: number) => void;
  onUpdateTextAnnot: (id: number, text: string, width?: number) => void;
  onResizeWidthAnnot: (id: number, widthPdf: number) => void;
  registerViewport: (index: number, viewport: PageViewport | null) => void;
  onCurrentPageChange: (page: number) => void;
  onZoomChange: (zoom: Zoom) => void;
}

const PAD_X = 32; // .pages horizontal padding

const EMPTY: Match[] = [];
const EMPTY_ANNOTS: Annot[] = [];

export const Viewer = forwardRef<ViewerHandle, ViewerProps>(function Viewer(
  { doc, dims, zoom, rotation, matches, currentMatch, tool, toolColor, inkWidth, textSize, annots, selectedAnnotId, onAddAnnot, onSelectAnnot, onMoveAnnot, onUpdateTextAnnot, onResizeWidthAnnot, registerViewport, onCurrentPageChange, onZoomChange },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const [visiblePages, setVisiblePages] = useState<Set<number>>(() => new Set([0, 1]));
  const currentPageRef = useRef(0);

  const ioRef = useRef<IntersectionObserver | null>(null);

  const registerWrap = useCallback((index: number, el: HTMLDivElement | null) => {
    const prev = wrapsRef.current[index];
    if (prev && ioRef.current) ioRef.current.unobserve(prev);
    wrapsRef.current[index] = el;
    if (el && ioRef.current) ioRef.current.observe(el);
  }, []);

  // Track the scroll container size for fit-width / fit-page.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () =>
      setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Effective swapped dims under user rotation.
  const layout = useMemo(() => {
    const swap = rotation % 180 !== 0;
    return dims.map((d) => {
      const bw = swap ? d.height : d.width;
      const bh = swap ? d.width : d.height;
      let scale = zoom.scale;
      if (zoom.mode === "fit-width") {
        scale = Math.max(0.1, (viewportSize.w - PAD_X - 24) / bw);
      } else if (zoom.mode === "fit-page") {
        scale = Math.max(
          0.1,
          Math.min((viewportSize.w - PAD_X - 24) / bw, (viewportSize.h - 48) / bh),
        );
      }
      return { scale, cssWidth: bw * scale, cssHeight: bh * scale };
    });
  }, [dims, zoom, rotation, viewportSize]);

  // Visibility tracking: which pages should have live canvases.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          let changed = false;
          const next = new Set(prev);
          for (const entry of entries) {
            const idx = Number((entry.target as HTMLElement).dataset.page);
            if (entry.isIntersecting && !next.has(idx)) {
              next.add(idx);
              changed = true;
            } else if (!entry.isIntersecting && next.has(idx)) {
              next.delete(idx);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      },
      { root, rootMargin: "800px 0px" },
    );
    ioRef.current = io;
    for (const el of wrapsRef.current) if (el) io.observe(el);
    return () => {
      ioRef.current = null;
      io.disconnect();
    };
  }, [dims.length, layout]);

  // Current page = the page occupying the reading line (40% down the view).
  const handleScroll = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const line = root.scrollTop + root.clientHeight * 0.4;
    let current = 0;
    for (let i = 0; i < wrapsRef.current.length; i++) {
      const el = wrapsRef.current[i];
      if (!el) continue;
      if (el.offsetTop <= line) current = i;
      else break;
    }
    if (current !== currentPageRef.current) {
      currentPageRef.current = current;
      onCurrentPageChange(current);
    }
  }, [onCurrentPageChange]);

  // Ctrl/Cmd + wheel zoom, anchored at the cursor.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const idx = Math.min(currentPageRef.current, layout.length - 1);
      const oldScale = layout[idx]?.scale ?? zoom.scale;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newScale = Math.min(6, Math.max(0.25, oldScale * factor));
      if (newScale === oldScale) return;
      const rect = root.getBoundingClientRect();
      const anchorY = e.clientY - rect.top;
      const anchorX = e.clientX - rect.left;
      const ratio = newScale / oldScale;
      onZoomChange({ mode: "custom", scale: newScale });
      requestAnimationFrame(() => {
        root.scrollTop = (root.scrollTop + anchorY) * ratio - anchorY;
        root.scrollLeft = (root.scrollLeft + anchorX) * ratio - anchorX;
      });
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [layout, zoom.scale, onZoomChange]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage(index: number) {
        const el = wrapsRef.current[index];
        const root = scrollRef.current;
        if (!el || !root) return;
        root.scrollTop = el.offsetTop - 24;
      },
      scrollToMatch(match: Match) {
        const root = scrollRef.current;
        const el = wrapsRef.current[match.page];
        if (!el || !root) return;
        // Jump near the page first so the page renders, then center the mark.
        const centre = () => {
          const mark = el.querySelector("mark.pl-hl.cur") as HTMLElement | null;
          if (mark) {
            const rootRect = root.getBoundingClientRect();
            const markRect = mark.getBoundingClientRect();
            root.scrollTop += markRect.top - rootRect.top - root.clientHeight / 2;
            return true;
          }
          return false;
        };
        if (!centre()) {
          root.scrollTop = el.offsetTop - 24;
          let tries = 0;
          const retry = () => {
            if (centre() || tries++ > 40) return;
            setTimeout(retry, 100);
          };
          setTimeout(retry, 100);
        }
      },
    }),
    [],
  );

  const matchesByPage = useMemo(() => {
    const map = new Map<number, Match[]>();
    for (const m of matches) {
      const list = map.get(m.page) ?? [];
      list.push(m);
      map.set(m.page, list);
    }
    return map;
  }, [matches]);

  const annotsByPage = useMemo(() => {
    const map = new Map<number, Annot[]>();
    for (const a of annots) {
      const list = map.get(a.page) ?? [];
      list.push(a);
      map.set(a.page, list);
    }
    return map;
  }, [annots]);

  return (
    <div className="viewer" ref={scrollRef} onScroll={handleScroll}>
      <div className="pages">
        {layout.map((l, i) => (
          <Page
            key={i}
            doc={doc}
            index={i}
            cssWidth={l.cssWidth}
            cssHeight={l.cssHeight}
            scale={l.scale}
            rotation={rotation}
            visible={visiblePages.has(i)}
            matches={matchesByPage.get(i) ?? EMPTY}
            currentMatch={currentMatch?.page === i ? currentMatch : null}
            tool={tool}
            toolColor={toolColor}
            inkWidth={inkWidth}
            textSize={textSize}
            annots={annotsByPage.get(i) ?? EMPTY_ANNOTS}
            selectedAnnotId={selectedAnnotId}
            onAddAnnot={onAddAnnot}
            onSelectAnnot={onSelectAnnot}
            onMoveAnnot={onMoveAnnot}
            onUpdateTextAnnot={onUpdateTextAnnot}
            onResizeWidthAnnot={onResizeWidthAnnot}
            registerWrap={registerWrap}
            registerViewport={registerViewport}
          />
        ))}
      </div>
    </div>
  );
});
