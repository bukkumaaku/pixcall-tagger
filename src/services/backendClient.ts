import {
    type AaaResult,
    type CheckForUpdateResult,
    type CommandPayloadMap,
    type CommandType,
    type Config,
    type DownloadFileProgress,
    type DownloadFileResult,
    type EchoResult,
    type ReadConfigResult,
    type PathInfoResult,
    type ScanWdModelsResult,
    type ProgressPayload,
    PROTOCOL_VERSION,
    type ResultDataMap,
    type WorkerMessage,
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
    type EmbeddingHealthResult,
    type EmbeddingPruneResult,
    type EmbeddingLoadResult,
    type EmbeddingModelInfo,
    type EmbeddingSearchResult,
    type EmbeddingStatusResult,
    type EmbeddingUnloadResult,
    createRequest,
} from "../protocol";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type PendingRequest = {
    expectedKind: keyof ResultDataMap;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    onProgress?: (progress: ProgressPayload) => void;
};

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
    private unlisten: UnlistenFn | null = null;
    private listenerPromise: Promise<void> | null = null;
    private readonly pending = new Map<string, PendingRequest>();

    get path() {
        return "tauri://ai-worker";
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
        this.listenerPromise ??= listen<WorkerMessage>("worker-progress", (event) => {
            this.handleMessage(event.payload);
        }).then((unlisten) => {
            this.unlisten = unlisten;
        });
    }

    echo(message: string): Promise<EchoResult> {
        return this.request("echo", { message });
    }

    aaa(value: string): Promise<AaaResult> {
        return this.request("aaa", { value });
    }

    checkForUpdate(): Promise<CheckForUpdateResult> {
        return this.request("check_for_update", {});
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
        });
    }

    indexEmbeddingBatch(
        sessionId: string,
        images: EmbeddingImageInput[],
    ): Promise<EmbeddingIndexBatchResult> {
        return this.request("embedding_index_batch", { sessionId, images });
    }

    pruneEmbedding(
        sessionId: string,
        itemIds: string[],
    ): Promise<EmbeddingPruneResult> {
        return this.request("embedding_prune", { sessionId, itemIds });
    }

    embeddingHealth(
        sessionId: string,
        itemIds: string[],
    ): Promise<EmbeddingHealthResult> {
        return this.request("embedding_health", { sessionId, itemIds });
    }

    embeddingStatus(sessionId: string): Promise<EmbeddingStatusResult> {
        return this.request("embedding_status", { sessionId });
    }

    searchEmbeddingText(
        sessionId: string,
        text: string,
        topK: number,
    ): Promise<EmbeddingSearchResult> {
        return this.request("embedding_search_text", {
            sessionId,
            text,
            topK,
        });
    }

    searchEmbeddingImage(
        sessionId: string,
        imagePath: string,
        excludeItemId: string,
        topK: number,
    ): Promise<EmbeddingSearchResult> {
        return this.request("embedding_search_image", {
            sessionId,
            imagePath,
            excludeItemId,
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

    dispose() {
        this.running = false;
        this.unlisten?.();
        this.unlisten = null;
        this.listenerPromise = null;
        void invoke("worker_dispose").catch((error) => {
            console.warn("Failed to stop ai-worker", error);
        });
        this.rejectAll(
            new BackendClientError("WORKER_DISPOSED", "ai-worker was disposed"),
        );
    }

    private request<K extends CommandType>(
        type: K,
        payload: CommandPayloadMap[K],
        onProgress?: (progress: ProgressPayload) => void,
    ): Promise<ResultDataMap[K]> {
        this.start();
        const requestId = `r-${Date.now()}-${++this.sequence}`;
        const request = createRequest(requestId, type, payload);

        return new Promise<ResultDataMap[K]>((resolve, reject) => {
            const pending: PendingRequest = {
                expectedKind: type,
                resolve: (value) => resolve(value as ResultDataMap[K]),
                reject,
                onProgress,
            };
            this.pending.set(requestId, pending);
            void (async () => {
                try {
                    await this.listenerPromise;
                    const message = await invoke<WorkerMessage>("worker_request", { request });
                    this.handleMessage(message);
                } catch (error) {
                    if (!this.pending.delete(requestId)) return;
                    this.running = false;
                    this.generation++;
                    pending.reject(
                        error instanceof Error
                            ? error
                            : new BackendClientError("WORKER_REQUEST_FAILED", String(error), requestId),
                    );
                }
            })();
        });
    }

    private handleMessage(message: WorkerMessage) {
        if (message.protocolVersion !== PROTOCOL_VERSION) {
            console.error("Unsupported ai-worker protocol version", message);
            return;
        }

        if (!message.requestId) {
            console.error("Uncorrelated ai-worker message", message);
            return;
        }

        const pending = this.pending.get(message.requestId);
        if (!pending) return;

        if (message.type === "progress") {
            try {
                pending.onProgress?.(message.payload);
            } catch (error) {
                console.error("Download progress callback failed", error);
            }
            return;
        }

        this.pending.delete(message.requestId);
        if (message.type === "error") {
            pending.reject(
                new BackendClientError(
                    message.payload.code,
                    message.payload.message,
                    message.requestId,
                ),
            );
            return;
        }

        if (message.payload.kind !== pending.expectedKind) {
            pending.reject(
                new BackendClientError(
                    "RESULT_KIND_MISMATCH",
                    `expected ${pending.expectedKind}, got ${message.payload.kind}`,
                    message.requestId,
                ),
            );
            return;
        }

        pending.resolve(message.payload.data);
    }

    private rejectAll(error: Error) {
        for (const pending of this.pending.values()) {
            pending.reject(error);
        }
        this.pending.clear();
    }
}

let defaultClient: BackendClient | null = null;

export function getBackendClient() {
    defaultClient ??= new BackendClient();
    return defaultClient;
}
