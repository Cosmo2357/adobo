import { useEffect, useState } from "react";
import type { Zoom } from "./Viewer";
import {
  IconChevronDown,
  IconChevronUp,
  IconFitPage,
  IconFitWidth,
  IconFolder,
  IconImage,
  IconMinus,
  IconNew,
  IconPanel,
  IconPlus,
  IconPrint,
  IconRotate,
  IconSave,
  IconSearch,
  IconUpdate,
} from "./icons";

interface ToolbarProps {
  docName: string | null;
  numPages: number;
  currentPage: number;
  zoom: Zoom;
  effectiveScale: number;
  sidebarOpen: boolean;
  findOpen: boolean;
  printing: boolean;
  onToggleSidebar: () => void;
  onNew: () => void;
  onNewFromImages: () => void;
  onOpen: () => void;
  onSaveAs: () => void;
  onPrint: () => void;
  onGoToPage: (index: number) => void;
  onZoomChange: (zoom: Zoom) => void;
  onRotate: () => void;
  onToggleFind: () => void;
  onCheckUpdate: () => void;
}

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6];

export function Toolbar(p: ToolbarProps) {
  const hasDoc = p.numPages > 0;
  const [pageText, setPageText] = useState("");

  useEffect(() => {
    setPageText(String(p.currentPage + 1));
  }, [p.currentPage]);

  const commitPage = () => {
    const n = parseInt(pageText, 10);
    if (Number.isFinite(n) && n >= 1 && n <= p.numPages) {
      p.onGoToPage(n - 1);
    } else {
      setPageText(String(p.currentPage + 1));
    }
  };

  const zoomBy = (dir: 1 | -1) => {
    const cur = p.effectiveScale;
    const next =
      dir === 1
        ? ZOOM_STEPS.find((s) => s > cur + 0.001)
        : [...ZOOM_STEPS].reverse().find((s) => s < cur - 0.001);
    if (next) p.onZoomChange({ mode: "custom", scale: next });
  };

  const zoomValue =
    p.zoom.mode === "custom" ? String(p.zoom.scale) : p.zoom.mode;

  return (
    <div className="toolbar">
      <button
        className={p.sidebarOpen ? "tb-btn on" : "tb-btn"}
        title="Toggle panel"
        onClick={p.onToggleSidebar}
        disabled={!hasDoc}
      >
        <IconPanel />
      </button>
      <button className="tb-btn" title="New PDF (Ctrl+N)" onClick={p.onNew}>
        <IconNew />
      </button>
      <button className="tb-btn" title="New PDF from images…" onClick={p.onNewFromImages}>
        <IconImage />
      </button>
      <button className="tb-btn" title="Open (Ctrl+O)" onClick={p.onOpen}>
        <IconFolder />
      </button>
      <button className="tb-btn" title="Save As" onClick={p.onSaveAs} disabled={!hasDoc}>
        <IconSave />
      </button>
      <button
        className="tb-btn"
        title="Print (Ctrl+P)"
        onClick={p.onPrint}
        disabled={!hasDoc || p.printing}
      >
        <IconPrint />
      </button>

      <div className="divider" />
      {p.docName && <div className="doc-title" title={p.docName}>{p.docName}</div>}

      <div className="spacer" />

      <div className="page-ctrl">
        <button
          className="tb-btn"
          title="Previous page"
          onClick={() => p.onGoToPage(Math.max(0, p.currentPage - 1))}
          disabled={!hasDoc || p.currentPage === 0}
        >
          <IconChevronUp />
        </button>
        <input
          value={pageText}
          disabled={!hasDoc}
          onChange={(e) => setPageText(e.target.value)}
          onBlur={commitPage}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <span className="total">/ {hasDoc ? p.numPages : "-"}</span>
        <button
          className="tb-btn"
          title="Next page"
          onClick={() => p.onGoToPage(Math.min(p.numPages - 1, p.currentPage + 1))}
          disabled={!hasDoc || p.currentPage >= p.numPages - 1}
        >
          <IconChevronDown />
        </button>
      </div>

      <div className="divider" />

      <button className="tb-btn" title="Zoom out" onClick={() => zoomBy(-1)} disabled={!hasDoc}>
        <IconMinus />
      </button>
      <select
        className="zoom-select"
        value={zoomValue}
        disabled={!hasDoc}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "fit-width" || v === "fit-page") {
            p.onZoomChange({ mode: v, scale: p.effectiveScale });
          } else {
            p.onZoomChange({ mode: "custom", scale: Number(v) });
          }
        }}
      >
        {p.zoom.mode === "custom" && !ZOOM_STEPS.includes(p.zoom.scale) && (
          <option value={p.zoom.scale}>{Math.round(p.zoom.scale * 100)}%</option>
        )}
        <option value="fit-width">Fit width</option>
        <option value="fit-page">Fit page</option>
        {ZOOM_STEPS.map((s) => (
          <option key={s} value={s}>
            {Math.round(s * 100)}%
          </option>
        ))}
      </select>
      <button className="tb-btn" title="Zoom in" onClick={() => zoomBy(1)} disabled={!hasDoc}>
        <IconPlus />
      </button>
      <button
        className={p.zoom.mode === "fit-width" ? "tb-btn on" : "tb-btn"}
        title="Fit width"
        onClick={() => p.onZoomChange({ mode: "fit-width", scale: p.effectiveScale })}
        disabled={!hasDoc}
      >
        <IconFitWidth />
      </button>
      <button
        className={p.zoom.mode === "fit-page" ? "tb-btn on" : "tb-btn"}
        title="Fit page"
        onClick={() => p.onZoomChange({ mode: "fit-page", scale: p.effectiveScale })}
        disabled={!hasDoc}
      >
        <IconFitPage />
      </button>
      <button className="tb-btn" title="Rotate 90° clockwise" onClick={p.onRotate} disabled={!hasDoc}>
        <IconRotate />
      </button>

      <div className="divider" />

      <button
        className={p.findOpen ? "tb-btn on" : "tb-btn"}
        title="Find (Ctrl+F)"
        onClick={p.onToggleFind}
        disabled={!hasDoc}
      >
        <IconSearch />
      </button>
      <button className="tb-btn" title="Check for updates" onClick={p.onCheckUpdate}>
        <IconUpdate />
      </button>
    </div>
  );
}
