import type { Annot, Tool } from "../lib/annots";
import { TOOL_COLORS } from "../lib/annots";

interface ToolsBarProps {
  tool: Tool;
  colors: Record<Exclude<Tool, "select">, string>;
  inkWidth: number;
  textSize: number;
  canUndo: boolean;
  dirty: boolean;
  organizing: boolean;
  hasAnnots: boolean;
  selectedAnnot: Annot | null;
  onToolChange: (tool: Tool) => void;
  onColorChange: (tool: Exclude<Tool, "select">, color: string) => void;
  onRecolorSelected: (color: string) => void;
  onDeleteSelected: () => void;
  onInkWidthChange: (w: number) => void;
  onTextSizeChange: (s: number) => void;
  onUndo: () => void;
  onSave: () => void;
  onToggleOrganize: () => void;
}

const TOOL_LABELS: [Tool, string][] = [
  ["select", "Select"],
  ["highlight", "Highlight"],
  ["ink", "Draw"],
  ["text", "Add Text"],
];

export function ToolsBar(p: ToolsBarProps) {
  const activeColorTool = p.tool !== "select" ? p.tool : null;
  return (
    <div className="toolsbar">
      {TOOL_LABELS.map(([tool, label]) => (
        <button
          key={tool}
          className={p.tool === tool ? "tool-btn on" : "tool-btn"}
          onClick={() => p.onToolChange(tool)}
        >
          {label}
        </button>
      ))}

      {activeColorTool && (
        <>
          <div className="divider" />
          {TOOL_COLORS[activeColorTool].map((c) => (
            <button
              key={c}
              className={
                "color-swatch" + (p.colors[activeColorTool] === c ? " on" : "")
              }
              style={{ background: c }}
              onClick={() => p.onColorChange(activeColorTool, c)}
              title={c}
            />
          ))}
          <input
            type="color"
            className="color-custom"
            title="Custom color"
            value={p.colors[activeColorTool]}
            onChange={(e) => p.onColorChange(activeColorTool, e.target.value)}
          />
        </>
      )}

      {p.tool === "select" && p.selectedAnnot && (
        <>
          <div className="divider" />
          <span className="tool-hint">Selected:</span>
          <input
            type="color"
            className="color-custom"
            title="Change color"
            value={p.selectedAnnot.color}
            onChange={(e) => p.onRecolorSelected(e.target.value)}
          />
          <button className="tool-btn" onClick={p.onDeleteSelected}>
            Delete
          </button>
        </>
      )}
      {p.tool === "select" && !p.selectedAnnot && p.hasAnnots && (
        <span className="tool-hint">
          Click an annotation to select · drag to move · double-click text to edit
        </span>
      )}

      {p.tool === "ink" && (
        <>
          <div className="divider" />
          <label className="tool-label">
            Width
            <input
              type="range"
              min={1}
              max={12}
              value={p.inkWidth}
              onChange={(e) => p.onInkWidthChange(Number(e.target.value))}
            />
          </label>
        </>
      )}
      {p.tool === "text" && (
        <>
          <div className="divider" />
          <label className="tool-label">
            Size
            <select
              className="zoom-select"
              value={p.textSize}
              onChange={(e) => p.onTextSizeChange(Number(e.target.value))}
            >
              {[10, 12, 14, 16, 20, 24, 32, 48].map((s) => (
                <option key={s} value={s}>{s}px</option>
              ))}
            </select>
          </label>
        </>
      )}

      <div className="spacer" />

      <button className="tool-btn" onClick={p.onUndo} disabled={!p.canUndo}>
        Undo
      </button>
      <button
        className={p.organizing ? "tool-btn on" : "tool-btn"}
        onClick={p.onToggleOrganize}
      >
        Organize Pages
      </button>
      <button className="tool-btn save" onClick={p.onSave} disabled={!p.dirty}>
        Save
      </button>
    </div>
  );
}
