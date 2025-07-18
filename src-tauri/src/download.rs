use futures_util::StreamExt;
use reqwest;
use std::fs;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use tauri::Emitter;

#[tauri::command]
pub async fn download_file(
    app: tauri::AppHandle,
    model_name: &str,
    file_name: &str,
    is_proxy: bool,
) -> Result<String, String> {
    let author_name = model_name.split('/').next().unwrap();
    let model_name = model_name.split('/').last().unwrap();
    let mut prefix = "";
    if cfg!(debug_assertions) {
        prefix = "target\\debug\\";
    }
    let path_name = format!(".\\{}models\\{}", prefix, model_name);
    let local_dir = Path::new(path_name.as_str());

    if let Err(e) = fs::create_dir_all(&local_dir) {
        return Err(format!("Failed to create directory {:?}: {}", local_dir, e));
    }
    let website;
    if !is_proxy {
        website = "huggingface.co";
    } else {
        website = "hf-mirror.com";
    }
    let target = format!(
        "https://{}/{}/{}/resolve/main/{}",
        website, author_name, model_name, file_name
    );
    println!("下载目标: {}", target);
    let response = reqwest::get(&target).await.unwrap();
    let total_size = response.content_length().unwrap_or(0);
    println!("文件大小: {} bytes", total_size);
    let mut dest = {
        let fname = target.as_str().split('/').last().unwrap_or("tmp.bin");
        println!("file to download: '{}'", fname);
        let fname = local_dir.join(fname);
        println!("will be located under: '{:?}'", fname);
        File::create(fname).unwrap()
    };

    let mut downloaded = 0u64;
    let mut progress: f64 = 0.0;

    // 流式下载
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.unwrap();
        dest.write_all(&chunk).unwrap();
        downloaded += chunk.len() as u64;

        // 计算并显示进度
        if total_size > 0 {
            let tmp_progress = (downloaded as f64 / total_size as f64) * 100.0;
            if (tmp_progress - progress).abs() < 0.01 {
                continue; // 如果进度变化小于0.1%，则跳过打印
            }
            app.emit("download_progress", format!("{:.2}", tmp_progress))
                .unwrap();
            println!(
                "进度: {:.2}% ({}/{} bytes)",
                tmp_progress, downloaded, total_size
            );
            progress = tmp_progress;
        } else {
            println!("已下载: {} bytes", downloaded);
            app.emit("download_progress", "100.00").unwrap();
        }
    }

    println!("下载完成！");
    Ok("OK".to_string())
}
