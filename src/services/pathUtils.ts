import { convertFileSrc, invoke } from "@tauri-apps/api/core";

let resourceRoot = "";

export async function initializeRuntimePaths() {
    const paths = await invoke<{ resourceRoot: string }>("runtime_paths");
    resourceRoot = paths.resourceRoot;
}

export function joinPath(...parts: string[]) {
    const filtered = parts.filter(Boolean);
    if (filtered.length === 0) return "";
    const separator = filtered[0].includes("\\") ? "\\" : "/";
    const prefix = /^[A-Za-z]:[\\/]$/.test(filtered[0]) ? filtered.shift() : "";
    const joined = filtered
        .map((part, index) =>
            index === 0
                ? part.replace(/[\\/]+$/g, "")
                : part.replace(/^[\\/]+|[\\/]+$/g, ""),
        )
        .filter(Boolean)
        .join(separator);
    return prefix ? `${prefix}${joined}` : joined;
}

export function resolveResourcePath(filePath: string) {
    if (isAbsolutePath(filePath)) return filePath;
    if (!resourceRoot) throw new Error("应用资源目录尚未初始化");
    return joinPath(resourceRoot, filePath.replace(/^src[\\/]public[\\/]/, ""));
}

export function dirname(filePath: string) {
    const index = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
    return index < 0 ? "." : filePath.slice(0, index);
}

export function extname(filePath: string) {
    const name = filePath.slice(Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")) + 1);
    const index = name.lastIndexOf(".");
    return index <= 0 ? "" : name.slice(index);
}

export function localAssetUrl(filePath: string) {
    return /^(?:data:|https?:|asset:)/i.test(filePath)
        ? filePath
        : convertFileSrc(filePath);
}

function isAbsolutePath(filePath: string) {
    return /^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith("/");
}
