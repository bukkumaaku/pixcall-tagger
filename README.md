# Pixcall AI Tagger

[English](./README.en.md) | 简体中文

Pixcall AI Tagger 是一个面向 Pixcall 的内置插件，使用 Vue 前端和 Rust `ai-worker`，为图片和视频生成标签、描述，并提供语义搜索。

当前版本：`2.0.2`

## 更新日志

### `2.0.2`

- 首次打开插件且未设置模型目录时，直接打开原生文件夹选择器。
- 取消选择模型目录时改为轻量警告通知，不再弹出重复确认框。
- 运行 LLM 前检查 llamafile，缺少运行程序时直接引导下载。

## 功能

### WD 模型打标

- 支持 PNG、JPG、JPEG、WEBP 和 BMP 图片，GIF 暂不处理。
- 支持批量打标，以及中文、英文或中英文标签。
- 可配置标签分隔符、置信度阈值、批次大小和已有标签处理方式。
- 支持不覆写、覆写和合并已有标签。
- 支持 WD、CL-Tagger 和 Camie 模型格式，模型完整性由 Rust worker 扫描实际文件决定。
- 视频可以关闭内容读取，或使用 ffmpeg 抽取 1%、20%、40%、60%、80% 和 99% 位置的画面后打标。

### LLM 图像理解

- 使用本地 llamafile 和 GGUF 视觉语言模型处理图片。
- 支持生成标签或写入 Pixcall 描述字段。
- 标签提示词和描述提示词可以分别编辑、保存和恢复默认值。
- 支持不覆写、覆写和合并已有标签或描述。
- 当前内置模型包括 Qwen3.5-9B 和 Qwen3-VL。

### 图片语义搜索

- 为 Pixcall 素材建立本地向量索引，已索引文件会自动跳过。
- 支持暂停、继续、批次大小、索引进度和健康检查。
- 支持文字搜图和以图搜图，结果按相似度排序并懒加载显示。
- 单击结果可预览，双击结果可在 Pixcall 中打开。
- 支持本地 Jina CLIP v2、OpenAI Compatible 和 Gemini 原生 REST embedding。
- 不同模型、协议和向量维度使用独立 SQLite 向量表。

### Pixcall 集成

- 通过 Pixcall 插件命令和右键菜单打开。
- 支持处理当前选中项目，也支持处理整个资源库。
- 全库枚举优先只读读取：
  ```text
  <Pixcall 资源库>/.pixcall/database/main.db
  ```
  查询得到的文件 ID 再通过 Pixcall 官方 `get_entries` 接口补齐详情；数据库不可用时回退到 `search_entries`。
- 标签、描述和打开文件仍然使用 Pixcall 官方接口，不直接修改 Pixcall 数据库。
- Windows 下 llamafile、ffmpeg 和 ffprobe 不会弹出黑色控制台窗口。

### 任务和配置

- 任务中心统一显示打标、索引、搜索和模型下载任务。
- 模型下载提供进度和错误提示。
- 插件启动时检查 GitHub Releases，发现新版本后提示更新。
- 配置默认保存在用户目录下的 `.pixcall-auto-tagger/config.json5`。
- 远程 embedding API key 使用操作系统凭据存储保护，不以明文写入配置文件。

## 支持平台

- Windows 10/11 x64
- macOS ARM64（Apple Silicon）
- 不支持 macOS x64。

Windows 下 WD 和本地 embedding 默认优先使用 DirectML，macOS 默认优先使用 CoreML，无法使用加速后端时回退到 CPU。

## 安装

插件最低需要 Pixcall `0.9.5`。

1. 打开 [GitHub Releases](https://github.com/bukkumaaku/pixcall-tagger/releases/latest)。
2. 下载已经编译好的 `pixcall-plugin-v2.0.2.zip`。
3. 解压压缩包。
4. 打开 Pixcall 的插件管理器，选择“加载插件文件夹”。
5. 选择解压后的 `release-dist` 文件夹，也就是直接包含 `manifest.json` 的文件夹。
6. 启用“AI 自动标签”插件。

大型模型文件不包含在插件包中。安装后在设置中选择模型根目录，再下载或手动放置模型。

## 模型目录

```text
模型根目录/
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
│       └── 其他模型配置文件
└── llamafile/
    └── llamafile-0.10.3（平台对应的可执行文件）
```

### WD 模型

当前内置下载列表包括：

- `wd-eva02-large-tagger-v3`
- `wd-vit-tagger-v3`
- `wd-vit-large-tagger-v3`
- `wd-v1-4-moat-tagger-v2`
- `cl_tagger`
- `camie-tagger-v2`

WD 模型必须放在 `模型根目录/wd/模型名/` 下，并包含对应格式的模型文件和标签元数据。

### LLM 模型

当前内置下载列表包括：

- `Qwen3.5-9B-Q4_K_M`
- `Qwen3VL-8B-Instruct-Q4_K_M`

每个模型需要放在 `模型根目录/llm/模型名/` 下，并准备 GGUF 主模型和对应的 `mmproj` 文件。llamafile runner 放在 `模型根目录/llamafile/` 下。

### Embedding 模型

本地 embedding 模型放在 `模型根目录/embedding/模型名/` 下。当前内置本地模型为 `jina-clip-v2-q8`。

远程 embedding 需要配置远程基础网址、API key、模型名称，以及 Gemini 原生 REST 的输出维度（128 到 3072）。

## 使用流程

1. 在设置中选择模型根目录。
2. 下载模型，或按上面的目录结构手动放置模型。
3. 在 WD 页面选择项目、模型、语言、阈值和覆写方式，然后开始打标。
4. 在 LLM 页面选择模型和操作类型，确认提示词后处理图片。
5. 在语义搜索页面选择 embedding 模型，先建立索引，再使用文字或图片搜索。
6. 使用任务中心查看进度、失败文件和后台任务。

视频读取内容需要系统 `PATH` 中同时存在 `ffmpeg` 和 `ffprobe`。插件会自动检测它们，缺少任意一个时不会启用视频抽帧。

## 从源码构建

### 环境要求

- Git
- Node.js 22 或兼容版本
- npm
- Rust `1.94.0`
- Windows x64 构建需要 Windows x64 Rust 工具链。
- macOS ARM64 构建需要 Apple Silicon 环境或 GitHub Actions 的 `macos-14`。

### 安装和运行

```powershell
git clone https://github.com/bukkumaaku/pixcall-tagger.git
cd pixcall-tagger
npm ci
npm run dev
```

### 构建插件

```powershell
npm run build
```

构建流程会编译 Rust worker、运行 Vue 类型检查、生成 Vite 前端、复制平台 worker，并生成可加载到 Pixcall 的 `dist` 目录。

Rust 测试：

```powershell
cargo test --manifest-path backend/Cargo.toml --workspace
```

GitHub Actions 推送 `main` 会构建 Windows x64 和 macOS ARM64；推送 `v*` 标签会构建跨平台插件，并将 zip 安装包发布到 GitHub Releases。当前标签示例：`v2.0.2`。

## 项目结构

```text
backend/
├── crates/protocol       JSON Lines 协议定义
├── crates/ai-worker      Rust worker、请求分发和 Pixcall 数据库读取
├── crates/wd-tagger      WD/CL/Camie ONNX 打标
├── crates/llamafile      llamafile 生命周期和图像请求
├── crates/*-embedding    本地及远程向量化
├── crates/video-tagger   ffmpeg 视频抽帧
└── crates/vector-store   SQLite vec 向量存储和搜索
src/
├── components/           Vue 功能界面
├── services/             Pixcall、worker 和任务中心服务
└── api/                  模型、配置和业务编排
```

## 问题反馈

请在 [GitHub Issues](https://github.com/bukkumaaku/pixcall-tagger/issues) 中提供：

- Pixcall 版本和操作系统。
- 使用的功能、模型名称和模型目录结构。
- 插件界面中的错误信息、浏览器控制台或 worker 日志。
- GPU 型号，以及使用的 DirectML、CoreML 或 CPU 后端。
- 能够稳定复现问题的最小步骤。
