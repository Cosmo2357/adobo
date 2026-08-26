# Adobo

A fast, lightweight PDF reader & editor for Windows and macOS, built with [Tauri](https://tauri.app) + React + [pdf.js](https://mozilla.github.io/pdf.js/) + [pdf-lib](https://pdf-lib.js.org/). Named after the Filipino dish.

## Features

**Viewing**
- Continuous scrolling viewer with page virtualization (large PDFs stay fast)
- Page thumbnails and bookmarks (outline) sidebar
- Text selection, full-document search with highlighted results
- Zoom (Ctrl+wheel / pinch, fit-width, fit-page), 90° rotation
- Print
- Open via file association, drag & drop, `Open with…`, or the file dialog
- Recent files

**Editing**
- Highlight text, freehand drawing, add text (Japanese supported via bundled Noto Sans JP)
- Organize pages: reorder (drag & drop), rotate, delete, extract to a new PDF, insert/merge another PDF
- Undo, save / save-as
- Annotations are flattened into the page content on save, so they render in every viewer

**App**
- Auto-updates from GitHub Releases
- Single-instance: opening another PDF reuses the running window

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+O` | Open |
| `Ctrl/Cmd+S` | Save |
| `Ctrl/Cmd+F` | Find |
| `Ctrl/Cmd+P` | Print |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd` + `+` / `-` / `0` | Zoom in / out / fit width |
| `Enter` / `Shift+Enter` (in find) | Next / previous match |

## Development

Prerequisites: Node.js 22+, Rust (stable). On Windows, the [Tauri prerequisites](https://tauri.app/start/prerequisites/) (WebView2 is preinstalled on Windows 10/11).

```sh
npm install
npm run tauri dev     # run the desktop app
npm run tauri build   # build installers for the current OS
```

## Releasing

Releases are built by GitHub Actions for **Windows** (NSIS `.exe` + `.msi`) and **macOS** (universal `.dmg`):

1. Bump `version` in `src-tauri/tauri.conf.json` (and `package.json`).
2. Commit, then tag and push:
   ```sh
   git tag v0.1.1 && git push origin v0.1.1
   ```
3. The workflow builds installers, signs the update artifacts, and publishes a GitHub Release including `latest.json`. Installed apps pick the update up automatically on next launch.

Required repository secrets:
- `TAURI_SIGNING_PRIVATE_KEY` — Tauri updater private key
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — its password (empty if none)

> Installers are not code-signed with an OS certificate, so Windows SmartScreen / macOS Gatekeeper will show a warning on first run ("More info → Run anyway" / right-click → Open).

## 日本語クイックスタート

- **インストール (Windows)**: [Releases](../../releases) から `Adobo_x.y.z_x64-setup.exe` をダウンロードして実行。SmartScreen の警告が出た場合は「詳細情報」→「実行」。
- 起動後、PDF をウィンドウにドラッグ＆ドロップするか `Ctrl+O` で開けます。
- 注釈（ハイライト・手書き・テキスト追加）は保存時にページへ焼き込まれます。
- 新しいバージョンが公開されると起動時に自動でアップデート通知が出ます。

## Fonts

Bundled font: [Noto Sans JP](https://github.com/notofonts/noto-cjk) © Google, licensed under the SIL Open Font License 1.1.

## Roadmap

- Editing existing PDF text
- Form filling & signatures
- Annotation objects (editable after save) instead of flattening
- OCR

## License

MIT
