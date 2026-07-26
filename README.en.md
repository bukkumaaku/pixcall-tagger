# Pixcall AI Tagger

English | [简体中文](./README.md)

Pixcall AI Tagger is a built-in Pixcall plugin with a Vue frontend and a Rust `ai-worker`. It generates tags and descriptions for images and videos, provides one-click workflows, and combines semantic search over images, tags, and descriptions.

Current version: `2.2.0`

## Features

### WD image tagging

- Supports PNG, JPG, JPEG, WEBP, and BMP images. GIF files are skipped.
- Supports batch tagging with Chinese, English, or mixed labels.
- Configurable tag separator, confidence threshold, batch size, and existing-tag behavior.
- Supports skip, overwrite, and merge modes for existing tags.
- Supports WD, CL-Tagger, and Camie model formats. The Rust worker scans the actual files before showing a model as available.
- Video content can be disabled or sampled with ffmpeg at 1%, 20%, 40%, 60%, 80%, and 99% of the duration before tagging.

### LLM image understanding

- Supports local llamafile + GGUF vision-language models and remote OpenAI-compatible or native Gemini REST vision models.
- Stores multiple remote LLM profiles and supports configurable concurrency for remote batches.
- Can generate tags or write a description to Pixcall.
- Tag and description prompts can be edited, saved independently, and restored to defaults.
- Supports skip, overwrite, and merge modes for existing tags or descriptions.
- Built-in local models include Qwen3.5-9B, Qwen3-VL 8B, and Llama JoyCaption Alpha Two 8B.
- llamafile stdout and stderr are written by date to `model-root/logs/YYYY-MM-DD.log`.
- Local LLM startup can auto-detect CUDA, Metal, and Vulkan, report unavailable backends clearly, and optionally fall back to Vulkan or CPU.

### Semantic image search

- Builds a local vector index for Pixcall assets and skips files that are already indexed.
- Supports pause, resume, batch size, index progress, and health checks.
- Supports text-to-image and image-to-image search with similarity sorting and lazy result loading.
- Click a result to preview it and double-click to open it in Pixcall.
- Supports local Jina CLIP v2, OpenAI Compatible, and native Gemini REST embeddings.
- Stores multiple remote embedding profiles.
- Indexes images, tags, and descriptions separately and combines them with configurable weights.
- Supports positive and negative text conditions combined with image similarity.
- Different models, protocols, and vector dimensions use separate SQLite vector tables.
- Provides index health checks, rebuild recovery, stale-item cleanup, and failure reporting.

### One-click workflows and backups

- Runs WD tagging, LLM tagging, LLM description generation, and image/tag/description vectorization as one configurable workflow.
- Supports pausing, resuming, and cancelling long tasks with stage progress and failure reporting.
- Creates categorized tag or description backups before batch writes and allows restoring a selected backup.

### Pixcall integration

- Opens from a Pixcall plugin command and context menu.
- Reads the current Pixcall selection and can process the entire library.
- Full-library enumeration first reads the database in read-only mode:
  ```text
  <Pixcall library>/.pixcall/database/main.db
  ```
  The returned file IDs are resolved through Pixcall's official `get_entries` request. If the database is unavailable, the plugin falls back to `search_entries`.
- Tags, descriptions, and file opening continue to use official Pixcall APIs. The plugin never writes directly to Pixcall's database.
- On Windows, llamafile, ffmpeg, and ffprobe child processes run without console windows.

### Tasks and configuration

- A unified task center shows tagging, indexing, search, and model download tasks.
- Model downloads report progress and surface errors.
- The plugin checks GitHub Releases on startup and reports available updates.
- Configuration is stored at `.pixcall-auto-tagger/config.json5` under the current user's home directory.
- Remote embedding and LLM profile API keys are protected by the operating system credential store and are not written to the config file in plain text.
- Configuration writes use an atomic same-directory replacement so an interrupted write cannot leave partial JSON5.

## Supported platforms

- Windows 10/11 x64
- macOS ARM64 (Apple Silicon)
- macOS x64 is not supported.

WD and local embedding inference use DirectML first on Windows and CoreML first on macOS, with CPU fallback when the accelerated provider is unavailable.

## Installation

Pixcall `0.9.5` or newer is required.

1. Open [GitHub Releases](https://github.com/bukkumaaku/pixcall-tagger/releases/latest).
2. Download the prebuilt `pixcall-plugin-v2.2.0.zip` package.
3. Extract the archive.
4. Open Pixcall's plugin manager and choose **Load Plugin Folder**.
5. Select the extracted `release-dist` directory, which directly contains `manifest.json`.
6. Enable the **AI Tagger** plugin.

Large model files are not included in the plugin package. Select a model root in Settings and download or place the models manually.

## Model directories

```text
model-root/
├── wd/
│   └── wd-eva02-large-tagger-v3/
│       ├── model.onnx
│       └── selected_tags.csv
├── llm/
│   └── Qwen3.5-9B-Q4_K_M/
│       ├── Qwen3.5-9B-Q4_K_M.gguf
│       └── mmproj-F16.gguf
├── embedding/
│   └── jina-clip-v2-q8/
│       ├── onnx/model_quantized.onnx
│       ├── tokenizer.json
│       └── other model configuration files
└── llamafile/
    └── llamafile-0.10.3 (platform-specific executable)
```

### WD models

The built-in download list currently includes:

- `wd-eva02-large-tagger-v3`
- `wd-vit-tagger-v3`
- `wd-vit-large-tagger-v3`
- `wd-v1-4-moat-tagger-v2`
- `cl_tagger`
- `camie-tagger-v2`

WD models must be placed under `model-root/wd/model-name/` with the model files and tag metadata required by the format.

### LLM models

The built-in download list currently includes:

- `Qwen3.5-9B-Q4_K_M`
- `Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-Q4_K_M`
- `Qwen3VL-8B-Instruct-Q4_K_M`
- `Llama-JoyCaption-Alpha-Two-8B-Q6_K`

Each model belongs under `model-root/llm/model-name/` and requires a GGUF main model plus its corresponding `mmproj` file. Place the platform-specific llamafile runner under `model-root/llamafile/`.

### Embedding models

Local embedding models belong under `model-root/embedding/model-name/`. The current built-in local model is `jina-clip-v2-q8`.

For remote embeddings, configure a service base URL, API key, model name, and the native Gemini REST output dimension from 128 to 3072.

## Usage

1. Select a model root in Settings.
2. Download models from the relevant page or place them in the directory structure above.
3. In WD Tagger, select assets, a model, language, threshold, and overwrite mode, then start tagging.
4. In LLM Image Understanding, select a model and operation, review the prompt, and process the image.
5. In Semantic Search, select an embedding model, build an index, and then search by text or image.
6. Use One-click Workflow to combine tagging, description generation, and all three vector indexes as needed.
7. Use the task center to monitor progress, failed files, and background tasks, and restore categorized backups when required.

Video content reading requires both `ffmpeg` and `ffprobe` on the system `PATH`. The plugin detects them automatically and disables video frame extraction if either tool is missing.

## Build from source

### Requirements

- Git
- Node.js 22 or a compatible version
- npm
- Rust `1.94.0`
- Windows x64 builds require the Windows x64 Rust toolchain.
- macOS ARM64 builds require Apple Silicon or GitHub Actions `macos-14`.

### Install and run

```powershell
git clone https://github.com/bukkumaaku/pixcall-tagger.git
cd pixcall-tagger
npm ci
npm run dev
```

### Build the plugin

```powershell
npm run build
```

The build compiles the Rust worker, runs Vue type checking, creates the Vite frontend, copies the platform worker, and produces the Pixcall-loadable `dist` directory.

Rust tests:

```powershell
cargo test --manifest-path backend/Cargo.toml --workspace
```

GitHub Actions builds Windows x64 and macOS ARM64 when `main` is pushed. Pushing a `v*` tag builds the cross-platform plugin and publishes its zip package to GitHub Releases. The current tag example is `v2.2.0`.

## Project structure

```text
backend/
├── crates/protocol       JSON Lines protocol definitions
├── crates/ai-worker      Rust worker, dispatch, and Pixcall database reads
├── crates/wd-tagger      WD/CL/Camie ONNX tagging
├── crates/llamafile      llamafile lifecycle and image requests
├── crates/*-embedding    Local and remote embeddings
├── crates/video-tagger   ffmpeg video frame extraction
└── crates/vector-store   SQLite vec storage and search
src/
├── components/           Vue feature interfaces
├── services/             Pixcall, worker, and task-center services
└── api/                  Model, configuration, and orchestration code
```

## Issues and feedback

When opening an issue on [GitHub Issues](https://github.com/bukkumaaku/pixcall-tagger/issues), include:

- Pixcall version and operating system.
- The feature, model name, and model directory structure involved.
- The plugin error message, browser console output, or worker log.
- GPU model and whether DirectML, CoreML, or CPU was used.
- The smallest set of steps that reproduces the problem.
