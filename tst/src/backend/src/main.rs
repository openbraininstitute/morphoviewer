#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::path::Path;
use tauri_plugin_dialog::DialogExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![file_select, file_load, file_save])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                app.get_webview_window("main").unwrap().open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn file_select(
    app: tauri::AppHandle,
    allowed_extensions: Option<Vec<String>>,
) -> Result<Option<String>, String> {
    let mut builder = app.dialog().file();
    if let Some(exts) = allowed_extensions {
        let refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
        builder = builder.add_filter("Files", &refs);
    }
    let path = builder.blocking_pick_file();
    Ok(path.map(|p| p.to_string()))
}

#[derive(Serialize)]
struct FileData {
    content: Vec<u8>,
    mimetype: String,
}

#[tauri::command]
async fn file_load(path: String) -> Result<Option<FileData>, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Ok(None);
    }
    let content = std::fs::read(p).map_err(|e| e.to_string())?;
    let mimetype = mime_guess::from_path(p)
        .first_or_octet_stream()
        .to_string();
    Ok(Some(FileData { content, mimetype }))
}

#[tauri::command]
async fn file_save(path: String, content: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| e.to_string())
}
