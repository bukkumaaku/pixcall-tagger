# Pixcall AI Tagger

Pixcall AI Tagger 是一个通过 Pixcall 本地 API 工作的 Tauri 桌面伴侣。当前版本迁移自 Eagle AI Tagger 2.0，并将宿主读写、窗口控制和 worker 生命周期改为 Pixcall/Tauri 实现。

## 功能

- WD / CL / Camie ONNX 图片打标
- 本地 llamafile 多模态标签与图片注释
- 本地、OpenAI 和 Gemini 向量模型的语义索引与搜索
- 模型下载、模型目录管理、任务进度和失败记录
- 中文、英文及双语标签，支持过滤、不覆写、覆写和合并

## 运行要求

- Windows 10/11 x64
- Pixcall 或 Pixcall 后台程序正在运行，并监听 `http://127.0.0.1:22510/request`
- Node.js 20+、Rust stable；开发模式还需要可用的 MSVC 工具链

首次启动会要求选择模型根目录。程序会在该目录下使用 `wd`、`llm`、`embedding` 和 `llamafile` 子目录。

## 开发

```powershell
npm install
npm run tauri dev
```

生产构建：

```powershell
npm run tauri build
```

构建脚本会先编译 `backend` 中的 `ai-worker`，再将 worker 及 DirectML 运行库复制到 `bin/win-x64`，最后由 Tauri 作为资源打包。

## Pixcall API 适配

基础打标依赖以下请求：

- `get_selected_entries`
- `get_entry_path`
- `get_all_tags`
- `create_tag`
- `update_entry`
- `get_settings`

全库打标和语义索引还需要 Pixcall 支持 `get_all_entries` 或 `get_entries`。若当前 Pixcall 版本未提供全库接口，选中项打标仍可使用，应用会对全库操作给出明确错误。

Pixcall 当前没有向该工具暴露 FFmpeg 路径，因此视频逐帧读取选项会保持禁用；视频缩略图仍可按普通图片参与 WD 打标。
