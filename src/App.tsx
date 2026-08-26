import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PageViewport } from "pdfjs-dist/types/src/display/display_utils";
import { loadDocument, type PDFDocumentProxy } from "./lib/pdf";
import { TextIndex, type Match } from "./lib/search";
import type { Annot, Tool } from "./lib/annots";
import {
  bakeAnnotations,
  createBlankPdf,
  extractPages,
  imagesToPdf,
  insertBlankPage,
  insertDocument,
  reorganize,
  type PageEdit,
} from "./lib/pdfedit";
import {
  askDialog,
  fileInfo,
  isTauri,
  onFileDrop,
  onFilesPending,
  pickImages,
  pickPdf,
  pickSavePath,
  readFileBytes,
  setWindowTitle,
  takePendingFiles,
  writeFileBytes,
} from "./lib/ipc";
import { checkForUpdates } from "./lib/updater";
import { printDocument } from "./lib/print";
import { Toolbar } from "./components/Toolbar";
import { ToolsBar } from "./components/ToolsBar";
import { Sidebar } from "./components/Sidebar";
import { Viewer, type PageDims, type ViewerHandle, type Zoom } from "./components/Viewer";
import { FindBar } from "./components/FindBar";
import { Organize } from "./components/Organize";
import { Welcome, type RecentEntry } from "./components/Welcome";

const RECENT_KEY = "adobo.recent";

function loadRecent(): RecentEntry[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function pushRecent(path: string, name: string): RecentEntry[] {
  const list = loadRecent().filter((r) => r.path !== path);
  list.unshift({ path, name, openedAt: Date.now() });
  const trimmed = list.slice(0, 8);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
  return trimmed;
}

interface DocState {
  path: string | null;
  name: string;
  bytes: Uint8Array;
  doc: PDFDocumentProxy;
  dims: PageDims[];
}

export default function App() {
  const [docState, setDocState] = useState<DocState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>(loadRecent);
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState<Zoom>({ mode: "fit-width", scale: 1 });
  const [rotation, setRotation] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [organizing, setOrganizing] = useState(false);
  const [printing, setPrinting] = useState(false);

  // search
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchIdx, setMatchIdx] = useState(0);
  const matchIdxRef = useRef(0);
  matchIdxRef.current = matchIdx;
  const [searching, setSearching] = useState(false);

  // annotation tools
  const [tool, setTool] = useState<Tool>("select");
  const [colors, setColors] = useState({
    highlight: "#ffe234",
    ink: "#e5252c",
    text: "#111111",
  });
  const [inkWidth, setInkWidth] = useState(3);
  const [textSize, setTextSize] = useState(16);
  const [annots, setAnnots] = useState<Annot[]>([]);
  const [selectedAnnotId, setSelectedAnnotId] = useState<number | null>(null);
  const nextAnnotId = useRef(1);
  const [bytesDirty, setBytesDirty] = useState(false);
  const byteHistory = useRef<{ bytes: Uint8Array; dirty: boolean }[]>([]);

  const viewerRef = useRef<ViewerHandle>(null);
  const textIndexRef = useRef<TextIndex | null>(null);
  const viewportsRef = useRef(new Map<number, PageViewport>());
  const searchAbort = useRef<AbortController | null>(null);
  const docStateRef = useRef<DocState | null>(null);
  docStateRef.current = docState;
  const dirtyRef = useRef(false);
  const dirty = annots.length > 0 || bytesDirty;
  dirtyRef.current = dirty;

  const registerViewport = useCallback((index: number, vp: PageViewport | null) => {
    if (vp) viewportsRef.current.set(index, vp);
    else viewportsRef.current.delete(index);
  }, []);

  const resetDocUi = () => {
    setCurrentPage(0);
    setAnnots([]);
    setSelectedAnnotId(null);
    setBytesDirty(false);
    byteHistory.current = [];
    setMatches([]);
    setMatchIdx(0);
    setQuery("");
    setFindOpen(false);
    setOrganizing(false);
    setRotation(0);
    setTool("select");
    viewportsRef.current.clear();
  };

  const mountBytes = useCallback(
    async (bytes: Uint8Array, path: string | null, name: string, opts?: { keepUi?: boolean }) => {
      const doc = await loadDocument(bytes);
      const dims: PageDims[] = await Promise.all(
        Array.from({ length: doc.numPages }, async (_, i) => {
          const page = await doc.getPage(i + 1);
          const vp = page.getViewport({ scale: 1 });
          return { width: vp.width, height: vp.height };
        }),
      );
      textIndexRef.current = new TextIndex(doc);
      docStateRef.current?.doc.destroy();
      setDocState({ path, name, bytes, doc, dims });
      if (!opts?.keepUi) resetDocUi();
      setError(null);
      setWindowTitle(`${name} - Adobo`);
      return doc;
    },
    [],
  );

  const confirmDiscard = useCallback(async () => {
    if (!dirtyRef.current) return true;
    return askDialog("You have unsaved changes. Discard them?", {
      title: "Unsaved changes",
      kind: "warning",
      okLabel: "Discard",
      cancelLabel: "Cancel",
    });
  }, []);

  const openPath = useCallback(
    async (path: string) => {
      try {
        if (!(await confirmDiscard())) return;
        const info = await fileInfo(path);
        if (!info.exists) {
          setError(`File not found: ${path}`);
          setRecent(loadRecent().filter((r) => r.path !== path));
          return;
        }
        const bytes = await readFileBytes(path);
        await mountBytes(bytes, path, info.name);
        setRecent(pushRecent(path, info.name));
        setZoom({ mode: "fit-width", scale: 1 });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [confirmDiscard, mountBytes],
  );

  const openDialog = useCallback(async () => {
    const path = await pickPdf();
    if (path) await openPath(path);
  }, [openPath]);

  const newDocument = useCallback(async () => {
    try {
      if (!(await confirmDiscard())) return;
      const bytes = await createBlankPdf();
      await mountBytes(bytes, null, "Untitled.pdf");
      setZoom({ mode: "fit-width", scale: 1 });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [confirmDiscard, mountBytes]);

  const newFromImages = useCallback(async () => {
    try {
      const paths = await pickImages();
      if (paths.length === 0) return;
      if (!(await confirmDiscard())) return;
      const images = await Promise.all(
        paths.map(async (path) => ({
          bytes: await readFileBytes(path),
          type: /\.png$/i.test(path) ? ("png" as const) : ("jpg" as const),
        })),
      );
      const bytes = await imagesToPdf(images);
      await mountBytes(bytes, null, "Untitled.pdf");
      setZoom({ mode: "fit-width", scale: 1 });
      setBytesDirty(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [confirmDiscard, mountBytes]);

  // Files queued by the backend (CLI args, second instance, "Open with").
  useEffect(() => {
    if (!isTauri) return;
    let disposed = false;
    const drain = async () => {
      const paths = await takePendingFiles();
      const pdf = paths.find((p) => p.toLowerCase().endsWith(".pdf")) ?? paths[0];
      if (!disposed && pdf) await openPath(pdf);
    };
    void drain();
    const off = onFilesPending(() => void drain());
    return () => {
      disposed = true;
      off();
    };
  }, [openPath]);

  // Native drag & drop.
  useEffect(() => {
    return onFileDrop((paths) => {
      const pdf = paths.find((p) => p.toLowerCase().endsWith(".pdf"));
      if (pdf) void openPath(pdf);
    });
  }, [openPath]);

  // Browser-only dev hook: load a PDF from the dev server via ?pdf=/dev/test.pdf
  useEffect(() => {
    if (isTauri) return;
    const src = new URLSearchParams(location.search).get("pdf");
    if (!src) return;
    fetch(src)
      .then((r) => r.arrayBuffer())
      .then((b) => mountBytes(new Uint8Array(b), null, src.split("/").pop() ?? "document.pdf"))
      .catch((e) => setError(String(e)));
  }, [mountBytes]);

  // Silent update check shortly after startup.
  useEffect(() => {
    const t = setTimeout(() => void checkForUpdates(false), 3000);
    return () => clearTimeout(t);
  }, []);

  // ---------- search ----------
  useEffect(() => {
    searchAbort.current?.abort();
    if (!query || !textIndexRef.current) {
      setMatches([]);
      setMatchIdx(0);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    searchAbort.current = ctrl;
    setSearching(true);
    const t = setTimeout(async () => {
      const found = await textIndexRef.current!.search(query, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setMatches(found);
      setMatchIdx(0);
      setSearching(false);
      if (found.length > 0) viewerRef.current?.scrollToMatch(found[0]);
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, docState]);

  const gotoMatch = useCallback(
    (delta: number) => {
      if (matches.length === 0) return;
      const next =
        ((matchIdxRef.current + delta) % matches.length + matches.length) % matches.length;
      matchIdxRef.current = next;
      setMatchIdx(next);
      viewerRef.current?.scrollToMatch(matches[next]);
    },
    [matches],
  );

  // ---------- highlight tool (text selection based) ----------
  useEffect(() => {
    if (tool !== "highlight") return;
    const onUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const rects = Array.from(sel.getRangeAt(0).getClientRects());
      sel.removeAllRanges();
      const layers = document.querySelectorAll<HTMLElement>(".textLayer[data-pl-page]");
      const newAnnots: Annot[] = [];
      layers.forEach((layer) => {
        const pageIdx = Number(layer.dataset.plPage);
        const viewport = viewportsRef.current.get(pageIdx);
        if (!viewport) return;
        const box = layer.getBoundingClientRect();
        const local: [number, number, number, number][] = [];
        for (const r of rects) {
          const x1 = Math.max(r.left, box.left);
          const y1 = Math.max(r.top, box.top);
          const x2 = Math.min(r.right, box.right);
          const y2 = Math.min(r.bottom, box.bottom);
          if (x2 - x1 < 2 || y2 - y1 < 2) continue;
          local.push([x1 - box.left, y1 - box.top, x2 - box.left, y2 - box.top]);
        }
        // Drop rects fully contained in another (selection APIs often
        // report nested duplicates).
        const kept = local.filter(
          ([ax1, ay1, ax2, ay2], i) =>
            !local.some(
              ([bx1, by1, bx2, by2], j) =>
                j !== i && bx1 <= ax1 && by1 <= ay1 && bx2 >= ax2 && by2 >= ay2 &&
                (bx1 < ax1 || by1 < ay1 || bx2 > ax2 || by2 > ay2),
            ),
        );
        if (kept.length === 0) return;
        const pdfRects = kept.map(([x1, y1, x2, y2]) => {
          const [px1, py1] = viewport.convertToPdfPoint(x1, y1);
          const [px2, py2] = viewport.convertToPdfPoint(x2, y2);
          return [
            Math.min(px1, px2),
            Math.min(py1, py2),
            Math.abs(px2 - px1),
            Math.abs(py2 - py1),
          ] as [number, number, number, number];
        });
        newAnnots.push({
          kind: "highlight",
          page: pageIdx,
          color: colors.highlight,
          rects: pdfRects,
        });
      });
      if (newAnnots.length > 0) {
        setAnnots((prev) => [
          ...prev,
          ...newAnnots.map((a) => ({ ...a, id: nextAnnotId.current++ })),
        ]);
      }
    };
    document.addEventListener("pointerup", onUp);
    return () => document.removeEventListener("pointerup", onUp);
  }, [tool, colors.highlight]);

  // ---------- annotation ops ----------
  const addAnnot = useCallback((annot: Annot) => {
    const id = nextAnnotId.current++;
    setAnnots((prev) => [...prev, { ...annot, id }]);
  }, []);

  const moveAnnot = useCallback((id: number, dx: number, dy: number) => {
    setAnnots((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        if (a.kind === "highlight") {
          return {
            ...a,
            rects: a.rects.map(
              ([x, y, w, h]) => [x + dx, y + dy, w, h] as [number, number, number, number],
            ),
          };
        }
        if (a.kind === "ink") {
          return {
            ...a,
            points: a.points.map(([x, y]) => [x + dx, y + dy] as [number, number]),
          };
        }
        return { ...a, x: a.x + dx, y: a.y + dy };
      }),
    );
  }, []);

  const updateTextAnnot = useCallback((id: number, text: string) => {
    setAnnots((prev) =>
      text.trim()
        ? prev.map((a) => (a.id === id && a.kind === "text" ? { ...a, text } : a))
        : prev.filter((a) => a.id !== id),
    );
  }, []);

  const removeAnnot = useCallback((id: number) => {
    setAnnots((prev) => prev.filter((a) => a.id !== id));
    setSelectedAnnotId(null);
  }, []);

  const recolorAnnot = useCallback((id: number, color: string) => {
    setAnnots((prev) => prev.map((a) => (a.id === id ? { ...a, color } : a)));
  }, []);

  // Drop the selection if the selected annotation disappears (undo, save…).
  useEffect(() => {
    if (selectedAnnotId !== null && !annots.some((a) => a.id === selectedAnnotId)) {
      setSelectedAnnotId(null);
    }
  }, [annots, selectedAnnotId]);

  // ---------- save / edit ----------
  const bakedBytes = useCallback(async () => {
    const ds = docStateRef.current!;
    return annots.length > 0 ? await bakeAnnotations(ds.bytes, annots) : ds.bytes;
  }, [annots]);

  const saveAs = useCallback(
    async (overwrite: boolean) => {
      const ds = docStateRef.current;
      if (!ds) return;
      try {
        const target =
          overwrite && ds.path ? ds.path : await pickSavePath(ds.name || "document.pdf");
        if (!target) return;
        const bytes = await bakedBytes();
        await writeFileBytes(target, bytes);
        const info = await fileInfo(target);
        await mountBytes(bytes, target, info.name, { keepUi: true });
        setAnnots([]);
        setBytesDirty(false);
        byteHistory.current = [];
        setRecent(pushRecent(target, info.name));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [bakedBytes, mountBytes],
  );

  const applyBytes = useCallback(
    async (next: Uint8Array) => {
      const ds = docStateRef.current!;
      byteHistory.current.push({ bytes: ds.bytes, dirty: bytesDirty });
      if (byteHistory.current.length > 10) byteHistory.current.shift();
      await mountBytes(next, ds.path, ds.name, { keepUi: true });
      setAnnots([]);
      setBytesDirty(true);
      setOrganizing(false);
    },
    [bytesDirty, mountBytes],
  );

  const handleOrganizeApply = useCallback(
    async (order: PageEdit[]) => {
      try {
        const next = await reorganize(await bakedBytes(), order);
        await applyBytes(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [bakedBytes, applyBytes],
  );

  const handleExtract = useCallback(
    async (order: PageEdit[]) => {
      const ds = docStateRef.current;
      if (!ds) return;
      try {
        const target = await pickSavePath(ds.name.replace(/\.pdf$/i, "") + "-pages.pdf");
        if (!target) return;
        const bytes = await extractPages(await bakedBytes(), order);
        await writeFileBytes(target, bytes);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [bakedBytes],
  );

  const handleInsert = useCallback(
    async (order: PageEdit[], at: number) => {
      try {
        const src = await pickPdf();
        if (!src) return;
        const insert = await readFileBytes(src);
        // Apply the pending arrangement first so `at` means what the user saw.
        let base = await bakedBytes();
        const ds = docStateRef.current!;
        const identity =
          order.length === ds.doc.numPages &&
          order.every((o, i) => o.source === i && o.extraRotation % 360 === 0);
        if (!identity) base = await reorganize(base, order);
        const next = await insertDocument(base, insert, at);
        await applyBytes(next);
        setOrganizing(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [bakedBytes, applyBytes],
  );

  const handleAddBlank = useCallback(
    async (order: PageEdit[], at: number) => {
      try {
        let base = await bakedBytes();
        const ds = docStateRef.current!;
        const identity =
          order.length === ds.doc.numPages &&
          order.every((o, i) => o.source === i && o.extraRotation % 360 === 0);
        if (!identity) base = await reorganize(base, order);
        const next = await insertBlankPage(base, at);
        await applyBytes(next);
        setOrganizing(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [bakedBytes, applyBytes],
  );

  const undo = useCallback(() => {
    if (annots.length > 0) {
      setAnnots((prev) => prev.slice(0, -1));
      return;
    }
    const prev = byteHistory.current.pop();
    if (prev) {
      const ds = docStateRef.current!;
      void mountBytes(prev.bytes, ds.path, ds.name, { keepUi: true }).then(() => {
        setBytesDirty(prev.dirty);
      });
    }
  }, [annots.length, mountBytes]);

  const handlePrint = useCallback(async () => {
    const ds = docStateRef.current;
    if (!ds || printing) return;
    setPrinting(true);
    try {
      await printDocument(ds.doc);
    } finally {
      setPrinting(false);
    }
  }, [printing]);

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (mod && e.key === "o") {
        e.preventDefault();
        void openDialog();
      } else if (mod && e.key === "n") {
        e.preventDefault();
        void newDocument();
      } else if (mod && e.key === "s") {
        e.preventDefault();
        if (dirtyRef.current) void saveAs(!e.shiftKey);
      } else if (mod && e.key === "p") {
        e.preventDefault();
        void handlePrint();
      } else if (mod && e.key === "f" && docStateRef.current) {
        e.preventDefault();
        setFindOpen(true);
      } else if (mod && e.key === "z" && !typing) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoom((z) => ({ mode: "custom", scale: Math.min(6, (z.scale || 1) * 1.2) }));
      } else if (mod && e.key === "-") {
        e.preventDefault();
        setZoom((z) => ({ mode: "custom", scale: Math.max(0.25, (z.scale || 1) / 1.2) }));
      } else if (mod && e.key === "0") {
        e.preventDefault();
        setZoom({ mode: "fit-width", scale: 1 });
      } else if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
        if (selectedAnnotId !== null) {
          e.preventDefault();
          removeAnnot(selectedAnnotId);
        }
      } else if (e.key === "Escape" && !typing) {
        if (findOpen) setFindOpen(false);
        else if (selectedAnnotId !== null) setSelectedAnnotId(null);
        else setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openDialog, newDocument, saveAs, undo, handlePrint, findOpen, selectedAnnotId, removeAnnot]);

  const effectiveScale = useMemo(() => {
    if (!docState || docState.dims.length === 0) return zoom.scale;
    if (zoom.mode === "custom") return zoom.scale;
    // representative: current page
    const vp = viewportsRef.current.get(currentPage);
    return vp ? vp.scale : zoom.scale;
  }, [zoom, currentPage, docState]);

  const goToPage = useCallback((index: number) => {
    viewerRef.current?.scrollToPage(index);
    setCurrentPage(index);
  }, []);

  const currentMatch = matches.length > 0 ? matches[matchIdx] : null;

  return (
    <div className="app">
      <Toolbar
        docName={docState ? docState.name + (dirty ? " •" : "") : null}
        numPages={docState?.doc.numPages ?? 0}
        currentPage={currentPage}
        zoom={zoom}
        effectiveScale={effectiveScale}
        sidebarOpen={sidebarOpen}
        findOpen={findOpen}
        printing={printing}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onNew={() => void newDocument()}
        onNewFromImages={() => void newFromImages()}
        onOpen={() => void openDialog()}
        onSaveAs={() => void saveAs(false)}
        onPrint={() => void handlePrint()}
        onGoToPage={goToPage}
        onZoomChange={setZoom}
        onRotate={() => setRotation((r) => (r + 90) % 360)}
        onToggleFind={() => setFindOpen((v) => !v)}
        onCheckUpdate={() => void checkForUpdates(true)}
      />
      {docState && !organizing && (
        <ToolsBar
          tool={tool}
          colors={colors}
          inkWidth={inkWidth}
          textSize={textSize}
          canUndo={annots.length > 0 || byteHistory.current.length > 0}
          dirty={dirty}
          organizing={organizing}
          hasAnnots={annots.length > 0}
          selectedAnnot={annots.find((x) => x.id === selectedAnnotId) ?? null}
          onToolChange={setTool}
          onColorChange={(t, c) => setColors((prev) => ({ ...prev, [t]: c }))}
          onRecolorSelected={(c) => {
            if (selectedAnnotId !== null) recolorAnnot(selectedAnnotId, c);
          }}
          onDeleteSelected={() => {
            if (selectedAnnotId !== null) removeAnnot(selectedAnnotId);
          }}
          onInkWidthChange={setInkWidth}
          onTextSizeChange={setTextSize}
          onUndo={undo}
          onSave={() => void saveAs(true)}
          onToggleOrganize={() => setOrganizing((v) => !v)}
        />
      )}
      <div className="body">
        {docState ? (
          organizing ? (
            <Organize
              key={docState.bytes.length + ":" + docState.doc.numPages}
              doc={docState.doc}
              onApply={(order) => void handleOrganizeApply(order)}
              onExtract={(order) => void handleExtract(order)}
              onInsert={(order, at) => void handleInsert(order, at)}
              onAddBlank={(order, at) => void handleAddBlank(order, at)}
              onCancel={() => setOrganizing(false)}
            />
          ) : (
            <>
              {sidebarOpen && (
                <Sidebar
                  doc={docState.doc}
                  numPages={docState.doc.numPages}
                  currentPage={currentPage}
                  rotation={rotation}
                  onGoToPage={goToPage}
                />
              )}
              <Viewer
                ref={viewerRef}
                doc={docState.doc}
                dims={docState.dims}
                zoom={zoom}
                rotation={rotation}
                matches={matches}
                currentMatch={currentMatch}
                tool={tool}
                toolColor={tool === "select" ? "#000" : colors[tool]}
                inkWidth={inkWidth}
                textSize={textSize}
                annots={annots}
                selectedAnnotId={selectedAnnotId}
                onAddAnnot={addAnnot}
                onSelectAnnot={setSelectedAnnotId}
                onMoveAnnot={moveAnnot}
                onUpdateTextAnnot={updateTextAnnot}
                registerViewport={registerViewport}
                onCurrentPageChange={setCurrentPage}
                onZoomChange={setZoom}
              />
            </>
          )
        ) : (
          <Welcome
            recent={recent}
            onOpen={() => void openDialog()}
            onNew={() => void newDocument()}
            onNewFromImages={() => void newFromImages()}
            onOpenRecent={(p) => void openPath(p)}
          />
        )}
      </div>
      {findOpen && docState && !organizing && (
        <FindBar
          query={query}
          total={matches.length}
          currentIndex={matchIdx}
          searching={searching}
          onQueryChange={setQuery}
          onNext={() => gotoMatch(1)}
          onPrev={() => gotoMatch(-1)}
          onClose={() => setFindOpen(false)}
        />
      )}
      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      <div id="print-root" />
    </div>
  );
}
