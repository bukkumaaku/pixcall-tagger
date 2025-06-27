mod aitagger;
mod db;
use crate::aitagger::get_tags;
use crate::db::{
    check_repository, create_tag_if_not_exists, get_db_connection, get_db_path, get_file_in_folder,
    get_folder, get_valid_folders, update_image_tags,
};

use std::collections::HashMap;

#[tauri::command]
fn check_repo(repo_path: String) -> bool {
    check_repository(&repo_path)
}

#[tauri::command]
fn get_folders(repo_path: String) -> Result<Vec<(String, String)>, String> {
    let db_path = get_db_path(&repo_path);
    let conn = get_db_connection(&db_path).map_err(|e| e.to_string())?;
    println!("Database connection established: {}", db_path);
    get_valid_folders(&conn).map_err(|e| e.to_string())
}

/* #[tauri::command]
async fn tag_images(
    repo_path: String,
    folder_id: String,
    tag_path: String,
    model_path: String,
) -> Result<(), String> {
    // 获取数据库连接
    let db_path = get_db_path(&repo_path);
    let conn = get_db_connection(&db_path).map_err(|e| e.to_string())?;

    // 获取文件夹中的图片
    let mut folder_hash = HashMap::new();
    let folder_list = get_folder(&conn, &mut folder_hash);
    let image_paths = get_file_in_folder(
        &conn,
        &repo_path,
        folder_id.clone(),
        &folder_hash,
        &folder_list,
    );

    println!("Image paths: {:?}", image_paths);
    // 调用打标函数 (pass by reference instead of value)
    let tag_sets = get_tags(&tag_path, &model_path, &image_paths).map_err(|e| e.to_string())?;

    // 处理每张图片的标签
    for (image_path, tags) in image_paths.iter().zip(tag_sets.iter()) {
        let mut tag_ids = Vec::new();

        // 处理每个标签
        for tag in tags {
            let tag_id = create_tag_if_not_exists(&conn, tag).map_err(|e| e.to_string())?;
            tag_ids.push(tag_id);
        }

        println!("处理每个标签结束");
        // 获取图片ID（根据路径查询）
        let mut stmt = conn
            .prepare("SELECT id FROM entries WHERE name = ?")
            .map_err(|e| e.to_string())?;
        let image_id: String = stmt
            .query_row([image_path], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        println!("Image ID: {}", image_id);
        // 更新图片的tags字段
        update_image_tags(&conn, &image_id, &tag_ids).map_err(|e| e.to_string())?;
    }

    Ok(())
} */

#[tauri::command]
async fn tag_images(
    thumb_hash: Vec<String>,
    tag_path: String,
    model_path: String,
) -> Result<Vec<Vec<String>>, String> {
    // 获取数据库连接
    let db_path = get_db_path("E:/Pixcall/.pixcall/database/thumbs.db");
    let conn = get_db_connection(&db_path).map_err(|e| e.to_string())?;
    // 调用打标函数 (pass by reference instead of value)
    let tag_sets =
        get_tags(&tag_path, &model_path, &thumb_hash, &conn).map_err(|e| e.to_string())?;
    Ok(tag_sets)
    // 处理每张图片的标签
    /*  for (image_path, tags) in image_paths.iter().zip(tag_sets.iter()) {
        let mut tag_ids = Vec::new();

        // 处理每个标签
        for tag in tags {
            let tag_id = create_tag_if_not_exists(&conn, tag).map_err(|e| e.to_string())?;
            tag_ids.push(tag_id);
        }

        println!("处理每个标签结束");
        // 获取图片ID（根据路径查询）
        let mut stmt = conn
            .prepare("SELECT id FROM entries WHERE name = ?")
            .map_err(|e| e.to_string())?;
        let image_id: String = stmt
            .query_row([image_path], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        println!("Image ID: {}", image_id);
        // 更新图片的tags字段
        update_image_tags(&conn, &image_id, &tag_ids).map_err(|e| e.to_string())?;
    }

    Ok(()) */
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_repo,
            get_folders,
            tag_images
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
