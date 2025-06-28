use rusqlite::{Connection, Result};
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

pub fn get_db_connection(db_path: &str) -> Result<Connection> {
    Connection::open(db_path)
}

pub fn get_db_path(repo_path: &str) -> String {
    format!("{}", repo_path)
}
