use futures::future::join_all;
use image::{imageops::FilterType, GenericImageView};
use ndarray::{prelude::*, Array};
use ort::{
    execution_providers::DirectMLExecutionProvider,
    session::{builder::GraphOptimizationLevel, Session},
    value::TensorRef,
};
use serde::Serialize;
use std::{
    collections::VecDeque,
    fs,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::Emitter;
use tokio::{
    sync::{Mutex, Notify},
    task as async_task,
};

#[derive(Debug, Clone, Serialize)]
struct AcquireTagsPayload {
    temp_set: Vec<Vec<String>>,
    batch: Vec<String>,
    size: usize,
}

struct SharedState {
    // 互斥队列 Q
    queue: Mutex<
        VecDeque<(
            ArrayBase<ndarray::OwnedRepr<f32>, Dim<[usize; 4]>>,
            Vec<String>,
        )>,
    >,
    // 条件变量，用于唤醒等待队列空间的生产者 (A)
    data_available: Notify,
    // 条件变量，用于唤醒等待数据的消费者 (B)
    space_available: Notify,
    // 原子标志，用于表示生产者(A)是否已完成工作
    process_image_finished: AtomicBool,
}

pub async fn fetch_image_async(
    hash: &String,
    file_server: &String,
) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
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
    let resized_img = img.resize_exact(448, 448, FilterType::Triangle);
    let mut pixel_data = Vec::with_capacity(448 * 448 * 3);
    for pixel in resized_img.pixels() {
        let [r, g, b, _] = pixel.2 .0;
        pixel_data.push(b as f32);
        pixel_data.push(g as f32);
        pixel_data.push(r as f32);
    }
    Ok(pixel_data.into())
}
async fn process_image_2(
    hash_batch: Vec<String>,
    file_server: String,
    state: Arc<SharedState>,
    batch_size: usize,
) -> Result<(), String> {
    let chunks = hash_batch.chunks(batch_size);
    for chunk in chunks.into_iter() {
        let chunk = chunk.to_vec();
        println!("正在处理图片的hash: {:?}", chunk);
        let chunk_len = chunk.len();
        let task: Vec<_> = chunk
            .into_iter()
            .map(async |item| {
                let file_server = file_server.clone();
                let result = async_task::spawn(async move {
                    let img = fetch_image_async(&item, &file_server).await.unwrap();
                    (img, item)
                })
                .await
                .map_err(|e| e.to_string());
                result
            })
            .collect();
        let results: Vec<(_, String)> = join_all(task)
            .await
            .into_iter()
            .map(|res| {
                let (img, hash) = res.unwrap();
                (img, hash.into())
            })
            .collect::<Vec<(_, String)>>();
        let mut hash_bacth: Vec<String> = vec![];
        let mut input: ArrayBase<ndarray::OwnedRepr<f32>, Dim<[usize; 4]>> =
            Array::zeros((chunk_len, 448, 448, 3));
        for i in 0..chunk_len {
            let (img, hash) = &results[i];
            hash_bacth.push(hash.clone());
            for y in 0..448 {
                for x in 0..448 {
                    let idx = (y * 448 + x) * 3;
                    input[[i, y, x, 0]] = img[idx]; // B
                    input[[i, y, x, 1]] = img[idx + 1]; // G
                    input[[i, y, x, 2]] = img[idx + 2]; // R
                }
            }
        }
        let mut queue_guard = state.queue.lock().await;
        println!("队列中有{}个任务", queue_guard.len());
        while queue_guard.len() >= 5 {
            drop(queue_guard);
            println!("等待队列空闲空间中");
            state.space_available.notified().await;
            queue_guard = state.queue.lock().await;
        }
        queue_guard.push_back((input.into(), hash_bacth.into()));
        drop(queue_guard);
        state.data_available.notify_one();
    }
    println!("图片已全部处理完毕");
    state.process_image_finished.store(true, Ordering::SeqCst);
    state.data_available.notify_one();
    Ok(())
}

fn set_session(model_path: String) -> Result<Session, Box<dyn std::error::Error>> {
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

fn get_tag_list(tag_path: String) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    println!("正在获取tag列表: {}", tag_path);
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

async fn get_image_tag_2(
    app: tauri::AppHandle,
    session: &mut Session,
    threshold: f32,
    tags: &Vec<String>,
    state: Arc<SharedState>,
) -> Result<(), String> {
    loop {
        state.data_available.notified().await;
        let mut queue_guard = state.queue.lock().await;
        if state.process_image_finished.load(Ordering::SeqCst) && queue_guard.is_empty() {
            println!("全部图片已获取完标签");
            return Ok(());
        }
        if queue_guard.len() < 1 && !state.process_image_finished.load(Ordering::SeqCst) {
            continue;
        }
        let item = queue_guard.pop_front().expect("error");
        let input = item.0;
        let hash_batch = item.1;
        println!("正在获取标签的图片的hash: {:?}", hash_batch);
        drop(queue_guard);
        state.space_available.notify_one();
        let outputs = session
            .run(ort::inputs![TensorRef::from_array_view(&input)
                .map_err(|e| e.to_string())
                .unwrap()])
            .map_err(|e| e.to_string())
            .unwrap();
        let output_tensor = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|e| e.to_string())
            .unwrap();
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
            app.emit("addnumber", 1).unwrap();
            println!("batch中获得标签{:?}", tag_set);
            tag_sets.push(tag_set);
        });

        let payload = AcquireTagsPayload {
            temp_set: tag_sets,
            size: hash_batch.len(),
            batch: hash_batch,
        };
        app.emit("acquire_tags", payload).unwrap();
    }
}

#[tauri::command]
pub async fn get_tags(
    app: tauri::AppHandle,
    tag_path: String,
    model_path: String,
    thumb_hash: Vec<String>,
    file_server: String,
    threshold: f32,
    batch_size: usize,
) -> Result<String, String> {
    let tags = Arc::new(get_tag_list(tag_path).map_err(|e| e.to_string())?);
    // 加载ONNX模型 (使用原始模型路径)
    let mut session = set_session(model_path).map_err(|e| e.to_string())?;
    let share_state = Arc::new(SharedState {
        queue: Mutex::new(VecDeque::new()),
        data_available: Notify::new(),
        space_available: Notify::new(),
        process_image_finished: AtomicBool::new(false),
    });
    let process_image_state = Arc::clone(&share_state);
    // 启动处理图片的线程
    let process_image_task = tokio::spawn(process_image_2(
        thumb_hash.clone(),
        file_server,
        process_image_state,
        batch_size,
    ));
    let get_image_tag_state = Arc::clone(&share_state);
    // 启动获取标签的线程
    let tags_clone = Arc::clone(&tags);
    let app_handle_clone = app.clone();
    let get_image_tag_task = tokio::spawn(async move {
        get_image_tag_2(
            app_handle_clone,
            &mut session,
            threshold,
            &tags_clone,
            get_image_tag_state,
        )
        .await
        .unwrap();
    });
    let (_process_image_result, _get_image_tag_result) =
        tokio::join!(process_image_task, get_image_tag_task);
    Ok("Tags acquired successfully".to_string())
}
