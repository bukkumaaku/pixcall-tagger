import type { CommandType, WorkerMessage, WorkerRequest } from "../protocol";
import { dirname, joinPath } from "./pathUtils";
import { translate } from "./i18n";

// Use a revisioned endpoint so an older worker cannot be mistaken for the
// current protocol implementation after the plugin is upgraded.
const WORKER_PORT = 22514;
const WORKER_TOKEN = "pixcall-ai-tagger-v4";
const WORKER_LOCK_NAME = "pixcall-ai-tagger-worker-startup";
const WORKER_REQUEST_TIMEOUT_MS = 330_000;
const PIXCALL_REQUEST_TIMEOUT_MS = 5000;
const PIXCALL_RETRY_DELAYS_MS = [200, 500, 1000, 2000];
const WORKER_HEALTH_TIMEOUT_MS = 500;
const RETRYABLE_PIXCALL_REQUESTS = new Set([
    "get_settings",
    "get_selected_entries",
    "get_entries_by_ids",
    "search_entries",
    "get_entry_path",
    "get_all_tags",
]);
export const PIXCALL_WORKER_CONNECTION_LOST = "pixcall-worker-connection-lost";
const LEGACY_WORKERS = [
    { port: 22513, token: "pixcall-ai-tagger-v3" },
    { port: 22512, token: "pixcall-ai-tagger-v2" },
    { port: 22511, token: "pixcall-ai-tagger-v1" },
];
let pixcallBaseUrl = "";
let workerReady: Promise<void> | null = null;
let shutdownRequested = false;
let startupLogLines: string[] = [];

function logWorkerStartup(startedAt: number, message: string) {
    const line = `+${(performance.now() - startedAt).toFixed(1)}ms ${message}`;
    startupLogLines.push(`${new Date().toISOString()} ${line}`);
    console.info(`[pixcall-worker] ${line}`);
}

async function flushWorkerStartupLog() {
    if (!startupLogLines.length) return;
    const lines = startupLogLines;
    startupLogLines = [];
    try {
        const response = await fetch(`http://127.0.0.1:${WORKER_PORT}/startup-log`, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "X-Pixcall-AI-Token": WORKER_TOKEN,
            },
            body: lines.join("\n"),
            signal: AbortSignal.timeout(1000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
        console.warn("Failed to persist pixcall-worker startup log", error);
    }
}

export type PixcallContext = "settings" | "serverPort" | "initMessage";

export async function getPixcallContext<T>(name?: string): Promise<T | null> {
    if (!window.pixcall?.getContext) return null;
    try {
        return await Promise.race([
            window.pixcall.getContext(name) as Promise<T>,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
        ]);
    } catch {
        return null;
    }
}

export async function pixcallRequest<T>(payload: Record<string, unknown>): Promise<T> {
    return pixcallSend<T>("request", payload);
}

export async function pixcallCommand<T>(payload: Record<string, unknown>): Promise<T> {
    return pixcallSend<T>("command", payload);
}

export async function closePixcallWindow() {
    await pixcallCommand({ type: "close_current_window" });
}

async function pixcallSend<T>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
    const retryable = endpoint === "request" &&
        typeof payload.type === "string" &&
        RETRYABLE_PIXCALL_REQUESTS.has(payload.type);
    const attempts = retryable ? PIXCALL_RETRY_DELAYS_MS.length + 1 : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
        if (!pixcallBaseUrl) {
            const context = await getPixcallContext<unknown>("serverPort");
            const port = typeof context === "number"
                ? context
                : context && typeof context === "object" && "port" in context
                    ? Number((context as { port?: unknown }).port)
                    : Number(context);
            pixcallBaseUrl = `http://127.0.0.1:${Number.isFinite(port) && port > 0 ? port : 22510}`;
        }
        let response: Response;
        try {
            response = await fetch(`${pixcallBaseUrl}/${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(PIXCALL_REQUEST_TIMEOUT_MS),
            });
        } catch (error) {
            lastError = error;
            pixcallBaseUrl = "";
            if (attempt + 1 >= attempts) throw error;
            await new Promise((resolve) => setTimeout(resolve, PIXCALL_RETRY_DELAYS_MS[attempt]));
            continue;
        }
        if (!response.ok) {
            const message = `Pixcall API ${response.status}: ${await response.text()}`;
            if (response.status < 500 || attempt + 1 >= attempts) throw new Error(message);
            lastError = new Error(message);
            pixcallBaseUrl = "";
        } else {
            const text = await response.text();
            return (text ? JSON.parse(text) : null) as T;
        }
        await new Promise((resolve) => setTimeout(resolve, PIXCALL_RETRY_DELAYS_MS[attempt]));
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function pathFromFileUrl() {
    const rawPath = decodeURIComponent(window.location.pathname || "");
    if (!rawPath) return "";
    const pathname = rawPath.replace(/^\/+([A-Za-z]:)/, "$1").replace(/\//g, "\\");
    if (/^[A-Za-z]:\\/.test(pathname) || /^\\\\/.test(pathname)) return dirname(pathname);
    return window.location.protocol === "file:" ? dirname(pathname) : "";
}

function normalizeAbsolutePath(value: unknown) {
    if (typeof value !== "string") return "";
    const candidate = value.trim();
    if (!candidate) return "";
    if (/^file:/i.test(candidate)) {
        try {
            const url = new URL(candidate);
            const pathname = decodeURIComponent(url.pathname);
            const windowsPath = url.host && /^[A-Za-z]:$/.test(url.host)
                ? `${url.host}${pathname}`
                : pathname;
            return windowsPath.replace(/^\/+([A-Za-z]:)/, "$1").replace(/\//g, "\\");
        } catch {
            return "";
        }
    }
    return /^[A-Za-z]:[\\/]/.test(candidate) || /^\\\\/.test(candidate) || candidate.startsWith("/")
        ? candidate
        : "";
}

function contextPathCandidates(value: unknown): unknown[] {
    if (typeof value === "string") return [value];
    if (!value || typeof value !== "object") return [];
    const record = value as Record<string, unknown>;
    const plugin = record.plugin && typeof record.plugin === "object"
        ? record.plugin as Record<string, unknown>
        : {};
    const paths = record.paths && typeof record.paths === "object"
        ? record.paths as Record<string, unknown>
        : {};
    return [
        plugin.path,
        plugin.directory,
        plugin.dir,
        plugin.root,
        plugin.rootPath,
        plugin.pluginPath,
        record.pluginPath,
        record.plugin_path,
        record.pluginDirectory,
        record.plugin_directory,
        record.pluginRoot,
        record.plugin_root,
        record.resourcePath,
        record.resource_path,
        record.resourceRoot,
        record.resource_root,
        paths.plugin,
        paths.pluginPath,
        paths.resource,
        paths.resourcePath,
    ];
}

export async function pluginRootPath() {
    // Repository and installed plugins are loaded from an absolute file URL.
    // Prefer it because Pixcall 0.9.7 may leave unknown getContext calls pending.
    const fileRoot = pathFromFileUrl();
    if (fileRoot) return fileRoot;

    // Pixcall 0.9.7 exposes the plugin location under different context names
    // depending on whether the command was opened from the repository or UI.
    const contexts = await Promise.all([
        getPixcallContext<Record<string, unknown>>(),
        getPixcallContext<Record<string, unknown>>("plugin"),
        getPixcallContext<Record<string, unknown>>("pluginPath"),
        getPixcallContext<Record<string, unknown>>("pluginRoot"),
        getPixcallContext<Record<string, unknown>>("path"),
        getPixcallContext<Record<string, unknown>>("resourcePath"),
    ]);
    const root = contexts
        .flatMap(contextPathCandidates)
        .map(normalizeAbsolutePath)
        .find(Boolean);
    if (root) return root;
    throw new Error(translate("startup.resource_root_uninitialized"));
}

export async function ensureWorker() {
    workerReady ??= withWorkerStartupLock(startWorker);
    try {
        await workerReady;
    } catch (error) {
        workerReady = null;
        throw error;
    }
}

async function withWorkerStartupLock(task: () => Promise<void>) {
    // Multiple Pixcall windows can open the plugin concurrently. Coordinate
    // startup so they cannot spawn competing workers on the same port.
    const locks = navigator.locks;
    if (!locks) return task();
    return locks.request(WORKER_LOCK_NAME, { mode: "exclusive" }, task);
}

async function startWorker() {
    const startedAt = performance.now();
    startupLogLines = [];
    const log = (message: string) => logWorkerStartup(startedAt, message);
    log("startup begin");

    shutdownRequested = false;
    void shutdownLegacyWorkers().catch(() => undefined);
    log("legacy worker cleanup scheduled in background");

    const existingHealthStartedAt = performance.now();
    const existingWorker = await workerStatus();
    if (existingWorker === "ready") {
        log(`existing worker ready in ${(performance.now() - existingHealthStartedAt).toFixed(1)}ms`);
        await flushWorkerStartupLog();
        return;
    }
    log(`${existingWorker} worker after ${(performance.now() - existingHealthStartedAt).toFixed(1)}ms`);

    if (existingWorker === "incompatible") {
        const shutdownStartedAt = performance.now();
        await shutdownIncompatibleWorker();
        log(`incompatible worker stopped in ${(performance.now() - shutdownStartedAt).toFixed(1)}ms`);
    }

    const contextStartedAt = performance.now();
    const context = await getPixcallContext<Record<string, unknown>>("");
    log(`runtime context resolved in ${(performance.now() - contextStartedAt).toFixed(1)}ms`);
    const env = context?.env && typeof context.env === "object"
        ? context.env as Record<string, unknown>
        : {};
    const platform = window.pixcall?.platform;
    const platformName = String(env.platform || "").toLowerCase();
    const userAgent = String(navigator.userAgent || "").toLowerCase();
    const isWindows = platform?.isWindows === true
        || platformName.startsWith("win")
        || userAgent.includes("windows");
    const isMacOS = platform?.isMacOS === true
        || platformName === "macos"
        || platformName === "darwin"
        || userAgent.includes("mac os");
    const workerDirectory = isWindows
        ? "win-x64"
        : isMacOS
            ? "mac-arm64"
            : "";
    const workerExecutable = isWindows ? "ai-worker.exe" : "ai-worker";
    if (!workerDirectory) throw new Error(translate("startup.unsupported_platform"));

    const rootStartedAt = performance.now();
    const root = await pluginRootPath();
    log(`plugin root resolved in ${(performance.now() - rootStartedAt).toFixed(1)}ms`);
    const command = joinPath(root, "bin", workerDirectory, workerExecutable);
    if (!command || command === workerExecutable) {
        throw new Error(`${translate("startup.resource_root_uninitialized")} (worker path is empty)`);
    }

    const spawnStartedAt = performance.now();
    await pixcallRequest({
        type: "spawn_child_process",
        command,
        args: [
            "--detach-http",
            "--port",
            String(WORKER_PORT),
            "--token",
            WORKER_TOKEN,
            "--host-port",
            String((await getPixcallContext<number>("serverPort")) || 22510),
        ],
        cwd: dirname(command),
    });
    log(`spawn_child_process returned in ${(performance.now() - spawnStartedAt).toFixed(1)}ms`);

    const healthStartedAt = performance.now();
    for (let attempt = 0; attempt < 80; attempt++) {
        if (await workerStatus() === "ready") {
            log(
                `worker ready after ${(performance.now() - healthStartedAt).toFixed(1)}ms ` +
                `(health checks: ${attempt + 1})`,
            );
            await flushWorkerStartupLog();
            return;
        }
        const delay = attempt < 10 ? 50 : 250;
        await new Promise((resolve) => setTimeout(resolve, delay));
    }
    log(`worker readiness timed out after ${(performance.now() - healthStartedAt).toFixed(1)}ms`);
    throw new Error(translate("startup.worker_start_failed", { port: WORKER_PORT }));
}

async function shutdownLegacyWorkers() {
    await Promise.all(LEGACY_WORKERS.map(async (worker) => {
        try {
            const response = await fetch(`http://127.0.0.1:${worker.port}/health`, {
                signal: AbortSignal.timeout(300),
            });
            if (!response.ok) return;
            await fetch(`http://127.0.0.1:${worker.port}/shutdown`, {
                method: "POST",
                headers: { "X-Pixcall-AI-Token": worker.token },
                signal: AbortSignal.timeout(500),
            });
        } catch {
            // No worker is listening on this legacy endpoint.
        }
    }));
}

type WorkerStatus = "ready" | "incompatible" | "unavailable";

async function workerStatus(): Promise<WorkerStatus> {
    try {
        const response = await fetch(`http://127.0.0.1:${WORKER_PORT}/health`, {
            signal: AbortSignal.timeout(WORKER_HEALTH_TIMEOUT_MS),
        });
        if (!response.ok) return "unavailable";
        const health = await response.json() as { streaming?: boolean; startupLog?: boolean };
        return health.streaming === true && health.startupLog === true
            ? "ready"
            : "incompatible";
    } catch {
        return "unavailable";
    }
}

async function shutdownIncompatibleWorker() {
    try {
        const response = await fetch(`http://127.0.0.1:${WORKER_PORT}/shutdown`, {
            method: "POST",
            headers: { "X-Pixcall-AI-Token": WORKER_TOKEN },
            signal: AbortSignal.timeout(WORKER_HEALTH_TIMEOUT_MS),
        });
        if (!response.ok) return;
        await new Promise((resolve) => setTimeout(resolve, 300));
    } catch {
        // No worker is listening on the configured port.
    }
}

export async function workerRequest<K extends CommandType>(
    request: WorkerRequest<K>,
    onMessage?: (message: WorkerMessage) => void,
): Promise<WorkerMessage[]> {
    await ensureWorker();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WORKER_REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(`http://127.0.0.1:${WORKER_PORT}/request-stream`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Pixcall-AI-Token": WORKER_TOKEN,
            },
            body: JSON.stringify(request),
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`ai-worker HTTP ${response.status}: ${await response.text()}`);
        if (!response.body) throw new Error("ai-worker HTTP response has no body");

        const messages: WorkerMessage[] = [];
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            let newline = buffer.indexOf("\n");
            while (newline >= 0) {
                const line = buffer.slice(0, newline).trim();
                buffer = buffer.slice(newline + 1);
                if (line) {
                    const message = JSON.parse(line) as WorkerMessage;
                    onMessage?.(message);
                    if (message.type !== "progress") messages.push(message);
                }
                newline = buffer.indexOf("\n");
            }
            if (done) break;
        }
        const tail = buffer.trim();
        if (tail) {
            const message = JSON.parse(tail) as WorkerMessage;
            onMessage?.(message);
            if (message.type !== "progress") messages.push(message);
        }
        return messages;
    } catch (error) {
        void shutdownWorker();
        window.dispatchEvent(new CustomEvent(PIXCALL_WORKER_CONNECTION_LOST, { detail: { error } }));
        if (controller.signal.aborted) {
            throw new Error("ai-worker request timed out; the task was cancelled");
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

export async function shutdownWorker() {
    if (shutdownRequested) return;
    shutdownRequested = true;
    workerReady = null;
    await fetch(`http://127.0.0.1:${WORKER_PORT}/shutdown`, {
        method: "POST",
        headers: { "X-Pixcall-AI-Token": WORKER_TOKEN },
        keepalive: true,
    }).catch(() => undefined);
}
