import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save, ask } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const isTauri = "isTauri" in window && Boolean((window as { isTauri?: unknown }).isTauri);

export interface FileInfo {
  name: string;
  size: number;
  modifiedMs: number | null;
  exists: boolean;
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const buf = await invoke<ArrayBuffer>("read_file_bytes", { path });
  return new Uint8Array(buf);
}

export async function writeFileBytes(path: string, contents: Uint8Array): Promise<void> {
  await invoke("write_file_bytes", { path, contents: Array.from(contents) });
}

export function fileInfo(path: string): Promise<FileInfo> {
  return invoke<FileInfo>("file_info", { path });
}

export function takePendingFiles(): Promise<string[]> {
  return invoke<string[]>("take_pending_files");
}

export async function pickPdf(): Promise<string | null> {
  const picked = await open({
    multiple: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return typeof picked === "string" ? picked : null;
}

export async function pickSavePath(defaultName: string): Promise<string | null> {
  return save({
    defaultPath: defaultName,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
}

export const askDialog = ask;

/** Subscribes to files queued by the backend; returns an unsubscribe. */
export function onFilesPending(handler: () => void): () => void {
  if (!isTauri) return () => {};
  const un = listen("adobo://files-pending", handler);
  return () => {
    un.then((f) => f());
  };
}

/** Native drag & drop of files onto the window. */
export function onFileDrop(handler: (paths: string[]) => void): () => void {
  if (!isTauri) return () => {};
  const un = getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === "drop") handler(event.payload.paths);
  });
  return () => {
    un.then((f) => f());
  };
}

export function setWindowTitle(title: string): void {
  if (!isTauri) {
    document.title = title;
    return;
  }
  void getCurrentWindow().setTitle(title);
}
