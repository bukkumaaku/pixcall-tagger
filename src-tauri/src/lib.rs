mod aitagger;
mod download;
use crate::aitagger::get_tags;
use crate::download::download_file;

#[tauri::command]
async fn tag_images(
    app: tauri::AppHandle,
    thumb_hash: Vec<String>,
    tag_path: String,
    model_path: String,
    file_server: String,
    threshold: f32,
    batch_size: usize,
) -> Result<String, String> {
    let tag_sets = get_tags(
        &app,
        &tag_path,
        &model_path,
        &thumb_hash,
        &file_server,
        threshold,
        batch_size,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(tag_sets)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![tag_images, download_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
