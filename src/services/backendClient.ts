import {
    type CheckForUpdateResult,
    type CommandPayloadMap,
    type CommandType,
    type Config,
    type DownloadFileProgress,
    type DownloadFileResult,
    type EchoResult,
    type ReadConfigResult,
    type PathInfoResult,
    type BackupListResult,
    type BackupReadResult,
    type BackupWriteResult,
    type ScanWdModelsResult,
    type SystemToolsResult,
    type MinimizePluginWindowResult,
    type PixcallListEntryIdsResult,
    type ProgressPayload,
    PROTOCOL_VERSION,
    type ResultDataMap,
    type WriteConfigResult,
    type WdExecutionProvider,
    type WdModelKind,
    type WdTaggerImage,
    type WdTagLanguage,
    type WdTaggerLoadResult,
    type WdTaggerBatchCompleteResult,
    type WdTaggerEnqueueResult,
    type WdTaggerUnloadResult,
    type WdTaggerVideoResult,
    type LlamafileLoadRequest,
    type LlamafileLoadResult,
    type LlamafileProcessImageRequest,
    type LlamafileProcessImageResult,
    type LlamafileUnloadResult,
    type EmbeddingExecutionProvider,
    type EmbeddingProvider,
    type EmbeddingImageInput,
    type EmbeddingIndexBatchResult,
    type EmbeddingTagInput,
    type EmbeddingIndexTagsResult,
    type EmbeddingPruneTagsResult,
    type EmbeddingHealthResult,
    type EmbeddingPruneResult,
    type EmbeddingLoadResult,
    type EmbeddingModelInfo,
    type EmbeddingSearchResult,
    type EmbeddingStatusResult,
    type EmbeddingMigrateTextResult,
    type EmbeddingUnloadResult,
    createRequest,
} from "../protocol";
import { ensureWorker, shutdownWorker, workerRequest } from "./pixcallBridge";

export class BackendClientError extends Error {
    readonly code: string;
    readonly requestId?: string;

    constructor(
        code: string,
        message: string,
        requestId?: string,
    ) {
        super(message);
        this.name = "BackendClientError";
        this.code = code;
        this.requestId = requestId;
    }
}

export class BackendClient {
    private sequence = 0;
    private generation = 0;
    private running = false;

    get path() {
        return "http://127.0.0.1:22514";
    }

    get isRunning() {
        return this.running;
    }

    get workerGeneration() {
        return this.generation;
    }

    start() {
        if (this.running) return;
        this.running = true;
        void ensureWorker().catch((error) => {
            this.running = false;
            console.error("Failed to start ai-worker", error);
        });
    }

    echo(message: string): Promise<EchoResult> {
        return this.request("echo", { message });
    }

    checkForUpdate(): Promise<CheckForUpdateResult> {
        return this.request("check_for_update", {});
    }

    systemTools(): Promise<SystemToolsResult> {
        return this.request("system_tools", {});
    }

    minimizePluginWindow(): Promise<MinimizePluginWindowResult> {
        return this.request("minimize_plugin_window", {});
    }

    listPixcallEntryIds(databasePath: string): Promise<PixcallListEntryIdsResult> {
        return this.request("pixcall_list_entry_ids", { databasePath });
    }

    downloadFile(
        url: string,
        destination: string,
        onProgress?: (progress: DownloadFileProgress) => void,
    ): Promise<DownloadFileResult> {
        return this.request("download_file", { url, destination }, (payload) => {
            if (payload.kind === "download_file") {
                onProgress?.(payload.data);
            }
        });
    }

    readConfig(): Promise<ReadConfigResult> {
        return this.request("read_config", {});
    }

    writeConfig(config: Config): Promise<WriteConfigResult> {
        return this.request("write_config", { config });
    }

    pathInfo(path: string): Promise<PathInfoResult> {
        return this.request("path_info", { path });
    }

    writeBackup(directory: string, filename: string, content: string): Promise<BackupWriteResult> {
        return this.request("backup_write", { directory, filename, content });
    }

    listBackups(directory: string): Promise<BackupListResult> {
        return this.request("backup_list", { directory });
    }

    readBackup(path: string): Promise<BackupReadResult> {
        return this.request("backup_read", { path });
    }

    scanWdModels(root: string): Promise<ScanWdModelsResult> {
        return this.request("scan_wd_models", { root });
    }

    async scanEmbeddingModels(root: string): Promise<{
        modelsDirectory: string;
        models: EmbeddingModelInfo[];
    }> {
        return this.request("scan_embedding_models", { root });
    }

    loadEmbedding(
        sessionId: string,
        modelKey: string,
        modelPath: string,
        tokenizerPath: string,
        databasePath: string,
        namespace: string,
        executionProvider: EmbeddingExecutionProvider = "auto",
        provider: EmbeddingProvider = "local",
        endpoint = "",
        apiKey = "",
        remoteModel = "",
        remoteDimension = 0,
        legacyModelKey = "",
    ): Promise<EmbeddingLoadResult> {
        return this.request("embedding_load", {
            sessionId,
            modelKey,
            modelPath,
            tokenizerPath,
            databasePath,
            namespace,
            executionProvider,
            provider,
            endpoint,
            apiKey,
            remoteModel,
            remoteDimension,
            legacyModelKey,
        });
    }

    indexEmbeddingBatch(
        sessionId: string,
        images: EmbeddingImageInput[],
        force = false,
    ): Promise<EmbeddingIndexBatchResult> {
        return this.request("embedding_index_batch", { sessionId, images, force });
    }

    indexEmbeddingTags(
        sessionId: string,
        items: EmbeddingTagInput[],
        concurrency: number,
        force = false,
        forceTagIds: string[] = [],
    ): Promise<EmbeddingIndexTagsResult> {
        return this.request("embedding_index_tags", {
            sessionId,
            items,
            concurrency,
            force,
            forceTagIds,
        });
    }
    indexEmbeddingAnnotations(sessionId: string, items: import("../protocol").EmbeddingAnnotationInput[], concurrency: number, force = false): Promise<import("../protocol").EmbeddingIndexAnnotationsResult> { return this.request("embedding_index_annotations", { sessionId, items, concurrency, force }); }

    pruneEmbeddingTags(sessionId: string, itemIds: string[]): Promise<EmbeddingPruneTagsResult> {
        return this.request("embedding_prune_tags", { sessionId, itemIds });
    }
    pruneEmbeddingAnnotations(sessionId: string, itemIds: string[]): Promise<import("../protocol").EmbeddingPruneAnnotationsResult> { return this.request("embedding_prune_annotations", { sessionId, itemIds }); }

    pruneEmbedding(
        sessionId: string,
        itemIds: string[],
    ): Promise<EmbeddingPruneResult> {
        return this.request("embedding_prune", { sessionId, itemIds });
    }

    embeddingHealth(
        sessionId: string,
        itemIds: string[],
        repairLegacyEndpoints = false,
    ): Promise<EmbeddingHealthResult> {
        return this.request("embedding_health", { sessionId, itemIds, repairLegacyEndpoints });
    }

    embeddingStatus(
        sessionId: string,
        options: {
            databasePath?: string;
            namespace?: string;
            modelKey?: string;
            dimension?: number;
            legacyModelKey?: string;
        } = {},
    ): Promise<EmbeddingStatusResult> {
        return this.request("embedding_status", { sessionId, ...options });
    }

    migrateEmbeddingText(
        databasePath: string,
        namespace: string,
        modelKey: string,
        dimension: number,
        legacyModelKey = "",
        onProgress?: (progress: {
            phase: string;
            completed: number;
            total: number;
        }) => void,
    ): Promise<EmbeddingMigrateTextResult> {
        return this.request(
            "embedding_migrate_text",
            { databasePath, namespace, modelKey, dimension, legacyModelKey },
            (progress) => {
                if (progress.kind === "embedding_text_migration") {
                    onProgress?.(progress.data);
                }
            },
        );
    }

    searchEmbeddingText(
        sessionId: string,
        text: string,
        topK: number,
        includeImage = true,
        includeTags = false,
        includeAnnotations = false,
    ): Promise<EmbeddingSearchResult> {
        return this.request("embedding_search_text", {
            sessionId,
            text,
            topK,
            includeImage,
            includeTags,
            includeAnnotations,
        });
    }

    searchEmbeddingImage(
        sessionId: string,
        imagePath: string,
        excludeItemId: string,
        imageModifiedAt: number,
        topK: number,
    ): Promise<EmbeddingSearchResult> {
        return this.request("embedding_search_image", {
            sessionId,
            imagePath,
            excludeItemId,
            imageModifiedAt,
            topK,
        });
    }

    unloadEmbedding(sessionId: string): Promise<EmbeddingUnloadResult> {
        return this.request("embedding_unload", { sessionId });
    }

    loadWdTagger(
        sessionId: string,
        modelPath: string,
        tagsPath: string,
        modelKind: WdModelKind = "wd",
        executionProvider: WdExecutionProvider = "auto",
        tagsetPath = "",
        language: WdTagLanguage = "en",
        splitter = "",
        filterTags: string[] = [],
    ): Promise<WdTaggerLoadResult> {
        return this.request("wd_tagger_load", {
            sessionId,
            modelPath,
            tagsPath,
            modelKind,
            executionProvider,
            tagsetPath,
            language,
            splitter,
            filterTags,
        });
    }

    enqueueWdTaggerImage(
        sessionId: string,
        image: WdTaggerImage,
    ): Promise<WdTaggerEnqueueResult> {
        return this.request("wd_tagger_enqueue", {
            sessionId,
            image,
        });
    }

    completeWdTaggerBatch(
        sessionId: string,
        threshold = 0.25,
    ): Promise<WdTaggerBatchCompleteResult> {
        return this.request("wd_tagger_batch_complete", {
            sessionId,
            threshold,
        });
    }

    tagVideoWithWdTagger(
        sessionId: string,
        videoPath: string,
        ffmpegPath: string,
        ffprobePath: string,
        frameCount: number,
        batchSize: number,
        threshold = 0.25,
    ): Promise<WdTaggerVideoResult> {
        return this.request("wd_tagger_video", {
            sessionId,
            videoPath,
            ffmpegPath,
            ffprobePath,
            frameCount,
            batchSize,
            threshold,
        });
    }

    unloadWdTagger(sessionId: string): Promise<WdTaggerUnloadResult> {
        return this.request("wd_tagger_unload", { sessionId });
    }

    loadLlamafile(request: LlamafileLoadRequest): Promise<LlamafileLoadResult> {
        return this.request("llamafile_load", request);
    }

    processImageWithLlamafile(
        request: LlamafileProcessImageRequest,
    ): Promise<LlamafileProcessImageResult> {
        return this.request("llamafile_process_image", request);
    }

    unloadLlamafile(sessionId: string): Promise<LlamafileUnloadResult> {
        return this.request("llamafile_unload", { sessionId });
    }

    extractVideoFrames(videoPath: string, ffmpegPath: string, ffprobePath: string) {
        return this.request("video_extract_frames", { videoPath, ffmpegPath, ffprobePath });
    }

    cleanupVideoFrames(directory: string) {
        return this.request("video_cleanup_frames", { directory });
    }
    processImageWithRemoteVision(request: import("../protocol").RemoteVisionProcessImageRequest): Promise<import("../protocol").RemoteVisionProcessImageResult> { return this.request("remote_vision_process_image", request); }
    processBatchWithRemoteVision(
        request: import("../protocol").RemoteVisionProcessBatchRequest,
        onItem?: (result: import("../protocol").RemoteVisionBatchItemResult) => void,
    ): Promise<import("../protocol").RemoteVisionProcessBatchResult> {
        return this.request(
            "remote_vision_process_batch",
            request,
            (progress) => {
                if (progress.kind === "remote_vision_batch_item") {
                    onItem?.(progress.data);
                }
            },
        );
    }

    dispose() {
        this.running = false;
        void shutdownWorker();
    }

    private async request<K extends CommandType>(
        type: K,
        payload: CommandPayloadMap[K],
        onProgress?: (progress: ProgressPayload) => void,
    ): Promise<ResultDataMap[K]> {
        this.start();
        const requestId = `r-${Date.now()}-${++this.sequence}`;
        const request = createRequest(requestId, type, payload);
        const messages = await workerRequest(request, (message) => {
            if (message.protocolVersion === PROTOCOL_VERSION && message.type === "progress") {
                onProgress?.(message.payload);
            }
        });
        for (const message of messages) {
            if (message.protocolVersion !== PROTOCOL_VERSION) continue;
            if (message.type === "progress") {
                continue;
            }
            if (message.type === "error") {
                throw new BackendClientError(message.payload.code, message.payload.message, message.requestId);
            }
            if (message.payload.kind !== type) {
                throw new BackendClientError(
                    "RESULT_KIND_MISMATCH",
                    `expected ${type}, got ${message.payload.kind}`,
                    message.requestId,
                );
            }
            return message.payload.data as ResultDataMap[K];
        }
        throw new BackendClientError("WORKER_EMPTY_RESPONSE", "ai-worker returned no result", requestId);
    }
}

let defaultClient: BackendClient | null = null;

export function getBackendClient() {
    defaultClient ??= new BackendClient();
    return defaultClient;
}
