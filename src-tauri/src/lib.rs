use std::sync::Mutex;

use tauri::{Emitter, Manager, State};

/// Paths handed to the app before the UI was ready to receive them:
/// command line arguments on first launch, a second launch that was folded
/// into this instance, or a macOS "Open with" event.
#[derive(Default)]
struct PendingFiles(Mutex<Vec<String>>);

/// Keeps only the arguments that look like a file we can open, so flags such
/// as `--no-sandbox` that the OS or the webview may append are ignored.
fn pdf_paths_from_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .map(strip_file_scheme)
        .filter(|path| std::path::Path::new(path).is_file())
        .collect()
}

fn strip_file_scheme(path: String) -> String {
    match path.strip_prefix("file://") {
        Some(rest) => percent_decode(rest),
        None => path,
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Drained by the frontend on mount and on every `files-pending` nudge.
#[tauri::command]
fn take_pending_files(pending: State<'_, PendingFiles>) -> Vec<String> {
    let mut pending = pending.0.lock().unwrap();
    std::mem::take(&mut *pending)
}

/// Returns the raw bytes as an IPC binary payload (an `ArrayBuffer` on the
/// frontend) rather than a JSON array, which matters for large documents.
#[tauri::command]
async fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
async fn write_file_bytes(path: String, contents: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("{path}: {e}"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FileInfo {
    name: String,
    size: u64,
    modified_ms: Option<u64>,
    exists: bool,
}

#[tauri::command]
fn file_info(path: String) -> FileInfo {
    let name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    match std::fs::metadata(&path) {
        Ok(meta) => FileInfo {
            name,
            size: meta.len(),
            modified_ms: meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64),
            exists: true,
        },
        Err(_) => FileInfo {
            name,
            size: 0,
            modified_ms: None,
            exists: false,
        },
    }
}

/// Queues paths and nudges the frontend. The queue is the single source of
/// truth: the frontend drains it on mount and again on every nudge, so a file
/// that arrives before the UI exists is not lost and never opens twice.
fn deliver(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    app.state::<PendingFiles>().0.lock().unwrap().extend(paths);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    let _ = app.emit("adobo://files-pending", ());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            deliver(app, pdf_paths_from_args(argv));
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingFiles::default())
        .invoke_handler(tauri::generate_handler![
            take_pending_files,
            read_file_bytes,
            write_file_bytes,
            file_info
        ])
        .setup(|app| {
            let paths = pdf_paths_from_args(std::env::args());
            if !paths.is_empty() {
                app.state::<PendingFiles>().0.lock().unwrap().extend(paths);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // macOS delivers "Open with" through the app delegate, not argv.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &_event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                deliver(_app, paths);
            }
        });
}
