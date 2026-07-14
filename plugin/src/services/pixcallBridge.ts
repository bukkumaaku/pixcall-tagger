import type { CommandType, WorkerMessage, WorkerRequest } from "../protocol";
import { dirname, joinPath } from "./pathUtils";

const WORKER_PORT = 22511;
const WORKER_TOKEN = "pixcall-ai-tagger-v1";
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
    const root = pluginRootPath();
    const command = joinPath(root, "bin", "win-x64", "ai-worker.exe");
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
        return response.ok;
    } catch {
        return false;
    }
}

export async function workerRequest<K extends CommandType>(request: WorkerRequest<K>): Promise<WorkerMessage[]> {
    await ensureWorker();
    const response = await fetch(`http://127.0.0.1:${WORKER_PORT}/request`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Pixcall-AI-Token": WORKER_TOKEN,
        },
        body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`ai-worker HTTP ${response.status}: ${await response.text()}`);
    const envelope = (await response.json()) as { messages: WorkerMessage[] };
    return envelope.messages;
}

export async function shutdownWorker() {
    if (!(await workerHealth())) return;
    await fetch(`http://127.0.0.1:${WORKER_PORT}/shutdown`, {
        method: "POST",
        headers: { "X-Pixcall-AI-Token": WORKER_TOKEN },
    }).catch(() => undefined);
    workerReady = null;
}
