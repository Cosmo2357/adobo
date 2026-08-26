import { useEffect, useRef } from "react";
import { IconChevronDown, IconChevronUp, IconClose } from "./icons";

interface FindBarProps {
  query: string;
  total: number;
  currentIndex: number;
  searching: boolean;
  onQueryChange: (q: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function FindBar(p: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="findbar">
      <input
        ref={inputRef}
        value={p.query}
        placeholder="Find in document"
        onChange={(e) => p.onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.shiftKey ? p.onPrev : p.onNext)();
          if (e.key === "Escape") p.onClose();
        }}
      />
      <span className="count">
        {p.query
          ? p.searching
            ? "Searching…"
            : p.total > 0
              ? `${p.currentIndex + 1} / ${p.total}`
              : "Not found"
          : ""}
      </span>
      <button className="tb-btn" title="Previous (Shift+Enter)" onClick={p.onPrev} disabled={p.total === 0}>
        <IconChevronUp size={16} />
      </button>
      <button className="tb-btn" title="Next (Enter)" onClick={p.onNext} disabled={p.total === 0}>
        <IconChevronDown size={16} />
      </button>
      <button className="tb-btn" title="Close (Esc)" onClick={p.onClose}>
        <IconClose size={16} />
      </button>
    </div>
  );
}
