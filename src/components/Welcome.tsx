import { useState } from "react";

export interface RecentEntry {
  path: string;
  name: string;
  openedAt: number;
}

interface WelcomeProps {
  recent: RecentEntry[];
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
}

export function Welcome({ recent, onOpen, onOpenRecent }: WelcomeProps) {
  const [over, setOver] = useState(false);

  return (
    <div
      className="welcome"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        // Native file drops are delivered through Tauri's drag-drop event;
        // this handler just clears the visual state.
        e.preventDefault();
        setOver(false);
      }}
    >
      <div className="logo">
        <div className="mark">Ad</div>
        Adobo
      </div>
      <div className={over ? "dropzone over" : "dropzone"}>
        <p>Drop a PDF here, or</p>
        <button className="btn-primary" onClick={onOpen}>
          Open PDF…
        </button>
      </div>
      {recent.length > 0 && (
        <div className="recent">
          <h3>Recent files</h3>
          {recent.map((r) => (
            <button key={r.path} className="recent-item" onClick={() => onOpenRecent(r.path)}>
              <span className="name">{r.name}</span>
              <span className="path">{r.path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
