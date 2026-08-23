import type { CommandType, WorkerMessage, WorkerRequest } from "../protocol";
import { dirname, joinPath } from "./pathUtils";
import { translate } from "./i18n";

// Use a revisioned endpoint so an older worker cannot be mistaken for the
// current protocol implementation after the plugin is upgraded.
const WORKER_PORT = 22514;
const WORKER_TOKEN = "pixcall-ai-tagger-v4";
const LEGACY_WORKERS = [
    { port: 22513, token: "pixcall-ai-tagger-v3" },
    { port: 22512, token: "pixcall-ai-tagger-v2" },
    { port: 22511, token: "pixcall-ai-tagger-v1" },
];
let pixcallBaseUrl = "";
let workerReady: Promise<void> | null = null;
let shutdownRequested = false;

export type PixcallContext = "settings" | "serverPort" | "initMessage";

export async function getPixcallContext<T>(name?: string): Promise<T | null> {
    if (!window.pixcall?.getContext) return null;
    try {
        return (await window.pixcall.getContext(name)) as T;
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

function pathFromFileUrl() {
    if (window.location.protocol !== "file:") return "";
    const pathname = decodeURIComponent(window.location.pathname).replace(/^\/+([A-Za-z]:)/, "$1");
    return dirname(pathname.replace(/\//g, "\\"));
}

function normalizeAbsolutePath(value: unknown) {
    if (typeof value !== "string") return "";
    if (/^file:/i.test(value)) {
        try {
            const url = new URL(value);
            const pathname = decodeURIComponent(url.pathname).replace(/^\/+([A-Za-z]:)/, "$1");
            return pathname.replace(/\//g, "\\");
        } catch {
            return "";
        }
    }
    return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value) || value.startsWith("/")
        ? value
        : "";
}

export async function pluginRootPath() {
    const context = await getPixcallContext<Record<string, unknown>>("");
    const plugin = context?.plugin && typeof context.plugin === "object"
        ? context.plugin as Record<string, unknown>
        : {};
    const candidates = [
        plugin.path,
        plugin.directory,
        plugin.dir,
        plugin.root,
        plugin.rootPath,
        context?.pluginPath,
        context?.pluginDirectory,
        context?.pluginRoot,
        context?.resourcePath,
    ];
    const root = candidates.map(normalizeAbsolutePath).find(Boolean);
    if (root) return root;
    const fileRoot = pathFromFileUrl();
    if (fileRoot) return fileRoot;
    throw new Error(translate("startup.resource_root_uninitialized"));
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
    shutdownRequested = false;
    await shutdownLegacyWorkers();
    if (await workerHealth()) return;
    await shutdownIncompatibleWorker();
    const context = await getPixcallContext<Record<string, unknown>>("");
    const env = context?.env && typeof context.env === "object"
        ? context.env as Record<string, unknown>
        : {};
    const platform = window.pixcall?.platform;
    const platformName = String(env.platform || "").toLowerCase();
    const isWindows = platform?.isWindows === true || platformName.startsWith("win");
    const isMacOS = platform?.isMacOS === true || platformName === "macos" || platformName === "darwin";
    const workerDirectory = isWindows
        ? "win-x64"
        : isMacOS
            ? "mac-arm64"
            : "";
    const workerExecutable = isWindows ? "ai-worker.exe" : "ai-worker";
    if (!workerDirectory) throw new Error(translate("startup.unsupported_platform"));
    const root = await pluginRootPath();
    const command = joinPath(root, "bin", workerDirectory, workerExecutable);
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
    for (let attempt = 0; attempt < 80; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (await workerHealth()) return;
    }
    throw new Error(translate("startup.worker_start_failed", { port: WORKER_PORT }));
}

async function shutdownLegacyWorkers() {
    for (const worker of LEGACY_WORKERS) {
        try {
            const response = await fetch(`http://127.0.0.1:${worker.port}/health`);
            if (!response.ok) continue;
            await fetch(`http://127.0.0.1:${worker.port}/shutdown`, {
                method: "POST",
                headers: { "X-Pixcall-AI-Token": worker.token },
            });
        } catch {
            // No worker is listening on this legacy endpoint.
        }
    }
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
    if (shutdownRequested) return;
    shutdownRequested = true;
    workerReady = null;
    await fetch(`http://127.0.0.1:${WORKER_PORT}/shutdown`, {
        method: "POST",
        headers: { "X-Pixcall-AI-Token": WORKER_TOKEN },
        keepalive: true,
    }).catch(() => undefined);
}
