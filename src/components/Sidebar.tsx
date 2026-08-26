import { useEffect, useRef, useState } from "react";
import { destToPageIndex, type OutlineNode, type PDFDocumentProxy } from "../lib/pdf";

interface SidebarProps {
  doc: PDFDocumentProxy;
  numPages: number;
  currentPage: number;
  rotation: number;
  onGoToPage: (index: number) => void;
}

function Thumbnail({
  doc,
  index,
  current,
  rotation,
  onClick,
}: {
  doc: PDFDocumentProxy;
  index: number;
  current: boolean;
  rotation: number;
  onClick: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [ratio, setRatio] = useState(1.294); // A4 portrait placeholder

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setVisible(true);
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      const page = await doc.getPage(index + 1);
      if (cancelled) return;
      const vp1 = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 });
      setRatio(vp1.height / vp1.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = (136 / vp1.width) * dpr;
      const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
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
  }, [doc, index, visible, rotation]);

  return (
    <div className={current ? "thumb on" : "thumb"} onClick={onClick}>
      <div className="thumb-frame" ref={frameRef}>
        {visible ? (
          <canvas ref={canvasRef} />
        ) : (
          <div className="thumb-placeholder" style={{ height: 136 * ratio }} />
        )}
      </div>
      <div className="thumb-num">{index + 1}</div>
    </div>
  );
}

function OutlineList({
  items,
  doc,
  onGoToPage,
}: {
  items: OutlineNode[];
  doc: PDFDocumentProxy;
  onGoToPage: (index: number) => void;
}) {
  return (
    <div>
      {items.map((item, i) => (
        <div key={i}>
          <button
            className={
              "outline-item" + (item.bold ? " bold" : "") + (item.italic ? " italic" : "")
            }
            onClick={async () => {
              const page = await destToPageIndex(doc, item.dest);
              if (page !== null) onGoToPage(page);
            }}
          >
            {item.title || "(untitled)"}
          </button>
          {item.items.length > 0 && (
            <div className="outline-children">
              <OutlineList items={item.items} doc={doc} onGoToPage={onGoToPage} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Sidebar({ doc, numPages, currentPage, rotation, onGoToPage }: SidebarProps) {
  const [tab, setTab] = useState<"thumbs" | "outline">("thumbs");
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    doc.getOutline().then((o) => {
      if (!cancelled) setOutline((o as OutlineNode[] | null) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  // Keep the active thumbnail in view.
  useEffect(() => {
    if (tab !== "thumbs") return;
    const root = scrollRef.current;
    const el = root?.children[currentPage] as HTMLElement | undefined;
    if (!root || !el) return;
    const top = el.offsetTop - root.offsetTop;
    if (top < root.scrollTop || top + el.offsetHeight > root.scrollTop + root.clientHeight) {
      root.scrollTop = top - root.clientHeight / 2 + el.offsetHeight / 2;
    }
  }, [currentPage, tab]);

  return (
    <div className="sidebar">
      <div className="sidebar-tabs">
        <button
          className={tab === "thumbs" ? "sidebar-tab on" : "sidebar-tab"}
          onClick={() => setTab("thumbs")}
        >
          Pages
        </button>
        <button
          className={tab === "outline" ? "sidebar-tab on" : "sidebar-tab"}
          onClick={() => setTab("outline")}
        >
          Bookmarks
        </button>
      </div>
      <div className="sidebar-scroll" ref={scrollRef}>
        {tab === "thumbs" &&
          Array.from({ length: numPages }, (_, i) => (
            <Thumbnail
              key={i}
              doc={doc}
              index={i}
              current={i === currentPage}
              rotation={rotation}
              onClick={() => onGoToPage(i)}
            />
          ))}
        {tab === "outline" &&
          (outline === null ? null : outline.length === 0 ? (
            <div className="outline-empty">No bookmarks</div>
          ) : (
            <OutlineList items={outline} doc={doc} onGoToPage={onGoToPage} />
          ))}
      </div>
    </div>
  );
}
