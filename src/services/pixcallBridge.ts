import type { CommandType, WorkerMessage, WorkerRequest } from "../protocol";
import { dirname, joinPath } from "./pathUtils";
import { translate } from "./i18n";

// Use a revisioned endpoint so an older worker cannot be mistaken for the
// current protocol implementation after the plugin is upgraded.
const WORKER_PORT = 22512;
const WORKER_TOKEN = "pixcall-ai-tagger-v2";
let pixcallBaseUrl = "";
let workerReady: Promise<void> | null = null;

export type PixcallContext = "settings" | "serverPort" | "initMessage";

export async function getPixcallContext<T>(name: PixcallContext): Promise<T | null> {
    if (!window.pixcall?.getContext) return null;
    return (await window.pixcall.getContext(name)) as T;
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
    if (!pixcallBaseUrl) {
        const port = await getPixcallContext<number>("serverPort");
        pixcallBaseUrl = `http://127.0.0.1:${port || 22510}`;
    }
    const response = await fetch(`${pixcallBaseUrl}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        throw new Error(`Pixcall API ${response.status}: ${await response.text()}`);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
}

export function pluginRootPath() {
    if (window.location.protocol !== "file:") return dirname(decodeURIComponent(window.location.pathname));
    const pathname = decodeURIComponent(window.location.pathname).replace(/^\/+([A-Za-z]:)/, "$1");
    return dirname(pathname.replace(/\//g, "\\"));
}

export async function ensureWorker() {
    workerReady ??= startWorker();
    try {
        await workerReady;
    } catch (error) {
        workerReady = null;
        throw error;
    }
}

async function startWorker() {
    if (await workerHealth()) return;
    await shutdownIncompatibleWorker();
    const platform = window.pixcall?.platform;
    const workerDirectory = platform?.isWindows
        ? "win-x64"
        : platform?.isMacOS
            ? "mac-arm64"
            : "";
    const workerExecutable = platform?.isWindows ? "ai-worker.exe" : "ai-worker";
    if (!workerDirectory) throw new Error(translate("startup.unsupported_platform"));
    const root = pluginRootPath();
    const command = joinPath(root, "bin", workerDirectory, workerExecutable);
    await pixcallRequest({
        type: "spawn_child_process",
        command,
        args: ["--detach-http", "--port", String(WORKER_PORT), "--token", WORKER_TOKEN],
        cwd: dirname(command),
    });
    for (let attempt = 0; attempt < 80; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (await workerHealth()) return;
    }
    throw new Error(`ai-worker 未能在 127.0.0.1:${WORKER_PORT} 启动`);
}

async function workerHealth() {
    try {
        const response = await fetch(`http://127.0.0.1:${WORKER_PORT}/health`);
        if (!response.ok) return false;
        const health = await response.json() as { streaming?: boolean };
        return health.streaming === true;
    } catch {
        return false;
    }
}

async function shutdownIncompatibleWorker() {
    try {
        const response = await fetch(`http://127.0.0.1:${WORKER_PORT}/health`);
        if (!response.ok) return;
        const health = await response.json() as { streaming?: boolean };
        if (health.streaming === true) return;
        await fetch(`http://127.0.0.1:${WORKER_PORT}/shutdown`, {
            method: "POST",
            headers: { "X-Pixcall-AI-Token": WORKER_TOKEN },
        });
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
    const response = await fetch(`http://127.0.0.1:${WORKER_PORT}/request-stream`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Pixcall-AI-Token": WORKER_TOKEN,
        },
        body: JSON.stringify(request),
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
                messages.push(message);
                onMessage?.(message);
            }
            newline = buffer.indexOf("\n");
        }
        if (done) break;
    }
    const tail = buffer.trim();
    if (tail) {
        const message = JSON.parse(tail) as WorkerMessage;
        messages.push(message);
        onMessage?.(message);
    }
    return messages;
}

export async function shutdownWorker() {
    if (!(await workerHealth())) return;
    await fetch(`http://127.0.0.1:${WORKER_PORT}/shutdown`, {
        method: "POST",
        headers: { "X-Pixcall-AI-Token": WORKER_TOKEN },
    }).catch(() => undefined);
    workerReady = null;
}
