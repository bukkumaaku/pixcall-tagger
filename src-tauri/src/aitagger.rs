use image::{imageops::FilterType, GenericImageView};
use ndarray::{prelude::*, Array};
use ort::{
    execution_providers::DirectMLExecutionProvider,
    session::{builder::GraphOptimizationLevel, Session},
    value::TensorRef,
};
use std::fs;
use tauri::Emitter;

pub async fn fetch_image_async(
    hash: &String,
    file_server: &String,
) -> Result<image::DynamicImage, Box<dyn std::error::Error>> {
    // 发送HTTP GET请求
    let response = reqwest::get(format!("{}/thumbs/{}", file_server, hash)).await?;

    // 检查响应状态
    if !response.status().is_success() {
        return Err(format!("HTTP请求失败，状态码: {}", response.status()).into());
    }

    // 读取响应体为字节数组
    let bytes = response.bytes().await?;

    // 将字节数组转换为DynamicImage
    let img = image::load_from_memory(&bytes)?;

    Ok(img)
}

async fn process_image(
    hash_batch: &[String],
    file_server: &String,
) -> Result<Array<f32, Dim<[usize; 4]>>, Box<dyn std::error::Error>> {
    println!("Processing image: {:?}", hash_batch);

    let mut input = Array::zeros((hash_batch.len(), 448, 448, 3));
    for (i, hash) in hash_batch.iter().enumerate() {
        let original_img = fetch_image_async(hash, file_server).await.unwrap();
        let img = original_img.resize_exact(448, 448, FilterType::Triangle);

        for (x, y, pixel) in img.pixels() {
            let [r, g, b, _] = pixel.0;
            // 转换为模型需要的格式 (BGR归一化)
            input[[i, y as usize, x as usize, 0]] = b as f32;
            input[[i, y as usize, x as usize, 1]] = g as f32;
            input[[i, y as usize, x as usize, 2]] = r as f32;
        }
    }
    Ok(input)
}

fn set_session(model_path: &str) -> Result<Session, Box<dyn std::error::Error>> {
    let mut prefix = "";
    if cfg!(debug_assertions) {
        prefix = "target/debug/";
    }
    let session = Session::builder()?
        .with_execution_providers([DirectMLExecutionProvider::default().build()])?
        .with_optimization_level(GraphOptimizationLevel::Level3)?
        .with_parallel_execution(true)?
        .commit_from_file(format!("{}{}", prefix, model_path))?;
    Ok(session)
}

fn get_tag_list(tag_path: &str) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    println!("[AITagger] Loading tag list from: {}", tag_path);
    let mut prefix = "";
    if cfg!(debug_assertions) {
        prefix = "target/debug/";
    }
    let tags_csv = fs::read_to_string(format!("{}{}", prefix, tag_path)).unwrap();
    let tags: Vec<String> = tags_csv
        .lines()
        .skip(1) // 跳过标题行
        .filter_map(|line| line.split(',').nth(1))
        .map(String::from)
        .collect();
    Ok(tags)
}

async fn get_image_tag(
    app: &tauri::AppHandle,
    hash_batch: &[String],
    session: &mut Session,
    threshold: &f32,
    tags: &Vec<String>,
    file_server: &String,
) -> Result<Vec<Vec<String>>, Box<dyn std::error::Error>> {
    let input: ArrayBase<ndarray::OwnedRepr<f32>, Dim<[usize; 4]>> =
        process_image(hash_batch, file_server)
            .await
            .map_err(|e| e.to_string())?;
    let outputs = session
        .run(ort::inputs![TensorRef::from_array_view(&input)
            .map_err(|e| e.to_string())
            .unwrap()])
        .map_err(|e| e.to_string())?;
    let output_tensor = outputs[0]
        .try_extract_tensor::<f32>()
        .map_err(|e| e.to_string())?;
    let probabilities = output_tensor.1;
    let probabilities_batch = probabilities.chunks(probabilities.len() / hash_batch.len());
    let mut tag_sets: Vec<Vec<String>> = vec![];
    probabilities_batch.for_each(|probabilities| {
        let mut results: Vec<(String, f32)> = tags
            .iter()
            .zip(probabilities.iter())
            .map(|(tag, prob)| (tag.clone(), *prob))
            .collect();
        // 按概率排序并过滤高概率结果
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        let tag_set = results
            .iter()
            .filter(|(_, prob)| *prob > *threshold)
            .map(|(tag, _)| tag.clone())
            .collect::<Vec<String>>();
        app.emit("addnumber", 1).unwrap();
        tag_sets.push(tag_set);
    });
    Ok(tag_sets)
}

#[tauri::command]
pub async fn get_tags(
    app: &tauri::AppHandle,
    tag_path: &str,
    model_path: &str,
    thumb_hash: &[String], // Change to reference
    file_server: &String,
    threshold: f32,
    batch_size: usize,
) -> Result<Vec<Vec<String>>, String> {
    let mut tag_sets: Vec<Vec<String>> = vec![];
    let tags = get_tag_list(tag_path).map_err(|e| e.to_string())?;
    // 加载ONNX模型 (使用原始模型路径)
    let hash_batches = thumb_hash.chunks(batch_size);
    let mut session = set_session(model_path).map_err(|e| e.to_string())?;
    for batch in hash_batches {
        let temp_set = get_image_tag(app, batch, &mut session, &threshold, &tags, file_server)
            .await
            .unwrap();
        tag_sets.extend(temp_set);
    }
    Ok(tag_sets)
}
