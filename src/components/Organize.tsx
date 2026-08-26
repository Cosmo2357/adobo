import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "../lib/pdf";
import type { PageEdit } from "../lib/pdfedit";

interface OrganizeProps {
  doc: PDFDocumentProxy;
  onApply: (order: PageEdit[]) => void;
  onExtract: (order: PageEdit[]) => void;
  onInsert: (order: PageEdit[], at: number) => void;
  onCancel: () => void;
}

interface Item extends PageEdit {
  id: number;
}

function PageThumb({ doc, source, extraRotation }: { doc: PDFDocumentProxy; source: number; extraRotation: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setVisible(true)),
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      const page = await doc.getPage(source + 1);
      if (cancelled) return;
      const rot = (page.rotate + extraRotation) % 360;
      const vp1 = page.getViewport({ scale: 1, rotation: rot });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (150 / vp1.width) * dpr, rotation: rot });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      await task.promise.catch(() => {});
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, source, extraRotation, visible]);

  return (
    <div ref={holderRef} className="org-thumb-frame">
      {visible ? <canvas ref={canvasRef} /> : <div style={{ height: 200 }} />}
    </div>
  );
}

export function Organize({ doc, onApply, onExtract, onInsert, onCancel }: OrganizeProps) {
  const [items, setItems] = useState<Item[]>(() =>
    Array.from({ length: doc.numPages }, (_, i) => ({ id: i, source: i, extraRotation: 0 })),
  );
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const toggle = (id: number, e: React.MouseEvent) => {
    setSelected((prev) => {
      const next = new Set(e.metaKey || e.ctrlKey ? prev : []);
      if (prev.has(id) && (e.metaKey || e.ctrlKey)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedItems = items.filter((it) => selected.has(it.id));
  const hasSelection = selectedItems.length > 0;

  const rotateSelected = () =>
    setItems((prev) =>
      prev.map((it) =>
        selected.has(it.id) ? { ...it, extraRotation: (it.extraRotation + 90) % 360 } : it,
      ),
    );

  const deleteSelected = () => {
    setItems((prev) => prev.filter((it) => !selected.has(it.id)));
    setSelected(new Set());
  };

  const move = (from: number, to: number) => {
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const dirty =
    items.length !== doc.numPages ||
    items.some((it, i) => it.source !== i || it.extraRotation !== 0);

  return (
    <div className="organize">
      <div className="organize-bar">
        <span className="org-info">
          {hasSelection ? `${selectedItems.length} page(s) selected` : "Click to select pages, drag to reorder"}
        </span>
        <div className="spacer" />
        <button className="tool-btn" onClick={rotateSelected} disabled={!hasSelection}>
          Rotate right
        </button>
        <button className="tool-btn" onClick={deleteSelected} disabled={!hasSelection || selectedItems.length === items.length}>
          Delete
        </button>
        <button className="tool-btn" onClick={() => onExtract(selectedItems)} disabled={!hasSelection}>
          Extract to file…
        </button>
        <button
          className="tool-btn"
          onClick={() => {
            const at = hasSelection
              ? Math.max(...selectedItems.map((s) => items.indexOf(s))) + 1
              : items.length;
            onInsert(items, at);
          }}
        >
          Insert PDF…
        </button>
        <div className="divider" />
        <button className="tool-btn" onClick={onCancel}>Cancel</button>
        <button className="tool-btn save" onClick={() => onApply(items)} disabled={!dirty || items.length === 0}>
          Apply
        </button>
      </div>
      <div className="organize-grid">
        {items.map((it, i) => (
          <div
            key={it.id}
            className={
              "org-thumb" +
              (selected.has(it.id) ? " on" : "") +
              (dragOver === i ? " drag-over" : "")
            }
            draggable
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(i);
            }}
            onDragLeave={() => setDragOver((d) => (d === i ? null : d))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              if (dragFrom.current !== null && dragFrom.current !== i) {
                move(dragFrom.current, i);
              }
              dragFrom.current = null;
            }}
            onClick={(e) => toggle(it.id, e)}
          >
            <PageThumb doc={doc} source={it.source} extraRotation={it.extraRotation} />
            <div className="thumb-num">{i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
