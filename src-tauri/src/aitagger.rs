use image::{imageops::FilterType, GenericImageView};
use ndarray::{prelude::*, Array};
use ort::{
    execution_providers::DirectMLExecutionProvider,
    session::{builder::GraphOptimizationLevel, Session},
    value::TensorRef,
};
use rusqlite::Connection;
use std::fs;

fn get_blob(
    hash: &String,
    conn: &Connection,
) -> Result<image::DynamicImage, Box<dyn std::error::Error>> {
    let mut stmt = conn
        .prepare("SELECT data FROM thumbnails where hash=?")
        .unwrap();
    let mut rows = stmt.query([hash]).unwrap();
    // data里是blob数据，需要解码成image::DynamicImage
    if let Ok(Some(row)) = rows.next() {
        let data: Vec<u8> = row.get(0).unwrap();
        let img = image::load_from_memory(&data).unwrap();
        return Ok(img);
    } else {
        println!("No image found for hash: {}", hash);
        Err(format!("No image found for hash: {}", hash).into())
    }
}

fn process_image(
    hash_batch: &[String],
    conn: &Connection,
) -> Result<Array<f32, Dim<[usize; 4]>>, Box<dyn std::error::Error>> {
    println!("Processing image: {:?}", hash_batch);

    let mut input = Array::zeros((hash_batch.len(), 448, 448, 3));
    hash_batch.iter().enumerate().for_each(|(i, hash)| {
        let original_img = get_blob(hash, conn).unwrap();
        let img = original_img.resize_exact(448, 448, FilterType::Triangle);

        for (x, y, pixel) in img.pixels() {
            let [r, g, b, _] = pixel.0;
            // 转换为模型需要的格式 (BGR归一化)
            input[[i, y as usize, x as usize, 0]] = b as f32;
            input[[i, y as usize, x as usize, 1]] = g as f32;
            input[[i, y as usize, x as usize, 2]] = r as f32;
        }
    });
    Ok(input)
}

fn set_session(model_path: &str) -> Result<Session, Box<dyn std::error::Error>> {
    let session = Session::builder()?
        .with_execution_providers([DirectMLExecutionProvider::default().build()])?
        .with_optimization_level(GraphOptimizationLevel::Level3)?
        .with_parallel_execution(true)?
        .commit_from_file(model_path)?;
    Ok(session)
}

fn get_tag_list(tag_path: &str) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let tags_csv = fs::read_to_string(tag_path).unwrap();
    let tags: Vec<String> = tags_csv
        .lines()
        .skip(1) // 跳过标题行
        .filter_map(|line| line.split(',').nth(1))
        .map(String::from)
        .collect();
    Ok(tags)
}

fn get_image_tag(
    hash_batch: &[String],
    session: &mut Session,
    threshold: f32,
    tags: &Vec<String>,
    conn: &Connection,
) -> Result<Vec<Vec<String>>, Box<dyn std::error::Error>> {
    let input: ArrayBase<ndarray::OwnedRepr<f32>, Dim<[usize; 4]>> =
        process_image(hash_batch, conn).map_err(|e| e.to_string())?;
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
            .filter(|(_, prob)| *prob > threshold)
            .map(|(tag, _)| tag.clone())
            .collect::<Vec<String>>();
        tag_sets.push(tag_set);
    });
    Ok(tag_sets)
}

#[tauri::command]
pub fn get_tags(
    tag_path: &str,
    model_path: &str,
    thumb_hash: &[String], // Change to reference
    conn: &Connection,
) -> Result<Vec<Vec<String>>, String> {
    let mut tag_sets: Vec<Vec<String>> = vec![];
    let threshold = 0.25;
    let tags = get_tag_list(tag_path).map_err(|e| e.to_string())?;
    // 加载ONNX模型 (使用原始模型路径)
    let batch_size = 5;
    let hash_batches = thumb_hash.chunks(batch_size);
    let mut session = set_session(model_path).map_err(|e| e.to_string())?;
    /* thumb_hash.into_iter().for_each(|hash| {
        tag_sets.push(get_image_tag(hash, &mut session, threshold, &tags, conn).unwrap())
    }); */
    hash_batches.for_each(|batch| {
        let temp_set = get_image_tag(batch, &mut session, threshold, &tags, conn).unwrap();
        println!("tag_set: {:#?}", temp_set);
        tag_sets.extend(temp_set);
    });
    println!("tag_sets: {:#?}", tag_sets);
    Ok(tag_sets)
}
