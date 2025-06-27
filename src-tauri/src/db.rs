use chrono::Utc;
use rand::Rng;
use rusqlite::{params, Connection, Result};
use std::collections::HashMap;
use std::path::Path;

// 检查资源库路径是否有效（存在.pixcall文件）
pub fn check_repository(repo_path: &str) -> bool {
    Path::new(repo_path).join(".pixcall").exists()
}

// 获取有效文件夹（kind=0且name≠"Trash"）
pub fn get_valid_folders(conn: &Connection) -> Result<Vec<(String, String)>> {
    let mut stmt =
        conn.prepare("SELECT id, name FROM entries WHERE kind = 0 AND name != 'Trash'")?;
    let folders = stmt
        .query_and_then([], |row| {
            let row_0: u64 = row.get(0)?;
            Ok((row_0.to_string(), row.get(1)?))
        })?
        .collect();
    println!("folders: {:?}", folders);
    folders
}

// 生成标签ID（最高位+3的毫秒时间戳 + 随机数）
pub fn generate_tag_id() -> String {
    let now = Utc::now();
    let timestamp_ms = now.timestamp_millis() as u64;

    // 在最高位添加3（通过位或操作）
    let high_bits = 3u64 << 60;
    let adjusted_timestamp = timestamp_ms | high_bits;

    let mut rng = rand::thread_rng();
    let random_part: u64 = rng.gen();

    format!("{:x}{:x}", adjusted_timestamp, random_part)
}

// 检查标签是否存在，不存在则创建
pub fn create_tag_if_not_exists(conn: &Connection, tag_name: &str) -> Result<String> {
    // 检查标签是否已存在
    let mut stmt = conn.prepare("SELECT id FROM tags WHERE name = ?")?;
    if let Some(existing_id) = stmt.query_row([tag_name], |row| row.get(0)).ok() {
        return Ok(existing_id);
    }

    // 创建新标签
    let new_id = generate_tag_id();
    conn.execute(
        "INSERT INTO tags (id, revision, group_id, name, pinyin, category) 
         VALUES (?1, 1, NULL, ?2, '', 'A')",
        params![&new_id, tag_name],
    )?;

    Ok(new_id)
}

// 更新图片的tags字段
pub fn update_image_tags(conn: &Connection, image_id: &str, tag_ids: &[String]) -> Result<()> {
    let tags_str = tag_ids.join("|");
    conn.execute(
        "UPDATE entries SET tags = ?1 WHERE id = ?2",
        params![tags_str, image_id],
    )?;
    Ok(())
}

pub fn get_folder(
    conn: &Connection,
    folder_hash: &mut HashMap<String, String>,
) -> Vec<(String, String, String)> {
    let mut stmt = conn
        .prepare("SELECT * FROM entries where content_type='application/folder'")
        .unwrap();
    let mut rows = stmt.query(()).unwrap();
    let mut result: Vec<(String, String, String)> = vec![];
    while let Ok(Some(row)) = rows.next() {
        let folder_id_u64: u64 = row.get(0).unwrap();
        let folder_id = folder_id_u64.to_string();
        let folder_parent_u64: u64 = row.get(2).unwrap();
        let folder_parent: String = folder_parent_u64.to_string();
        let folder_name: String = row.get(3).unwrap();
        if folder_hash.get(&folder_parent).is_none() {
            //folder_hash.insert(folder_parent.to_string(), folder_name.to_string());
            folder_hash.insert(folder_id.to_string(), folder_name.to_string());
        } else {
            folder_hash.insert(
                folder_id.to_string(),
                format!(
                    "{}/{}",
                    folder_hash.get(&folder_parent).unwrap(),
                    folder_name
                ),
            );
        }
        result.push((folder_id, folder_name, folder_parent));
    }
    println!("folder_hash: {:?}", folder_hash);
    println!("result: {:?}", result);
    result
}

pub fn get_file_in_folder(
    conn: &Connection,
    repo_path: &String,
    folder_id: String,
    folder_hash: &HashMap<String, String>,
    folder_list: &[(String, String, String)],
) -> Vec<String> {
    let mut stmt = conn
        .prepare("SELECT * FROM entries where parent_id=? and content_type!='application/folder'")
        .unwrap();
    let mut target_folder_path = "".to_string();
    for (f_id, f_name, f_parent_id) in folder_list {
        if *f_id == folder_id {
            target_folder_path = folder_hash.get(f_id).unwrap_or(&"".to_string()).to_string();
            break;
        }
    }
    let mut rows = stmt.query([folder_id]).unwrap();
    let mut result = vec![];
    while let Ok(Some(row)) = rows.next() {
        let file_name: String = row.get(3).unwrap();
        result.push(format!(
            "{}/{}/{}",
            repo_path,
            target_folder_path, /* folder_hash
                                .get(&target_folder_path)
                                .unwrap_or(&"".to_string()) */
            file_name
        ));
    }
    println!("get_file_in_folder result: {:?}", result);
    result
}

pub fn get_db_connection(db_path: &str) -> Result<Connection> {
    Connection::open(db_path)
}

// 获取数据库路径（资源库路径 + /.pixcall/database/main.db）
pub fn get_db_path(repo_path: &str) -> String {
    //format!("{}/.pixcall/database/main.db", repo_path)
    format!("{}", repo_path)
}
