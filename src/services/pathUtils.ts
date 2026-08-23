import { translate } from "./i18n";

let resourceRoot = "";

export async function initializeRuntimePaths(root?: string) {
    if (root) {
        resourceRoot = root;
        return;
    }
    const pathname = decodeURIComponent(window.location.pathname).replace(/^\/+([A-Za-z]:)/, "$1");
    resourceRoot = dirname(pathname.replace(/\//g, "\\"));
}

export function joinPath(...parts: string[]) {
    const filtered = parts.filter(Boolean);
    if (filtered.length === 0) return "";
    const separator = filtered[0].includes("\\") ? "\\" : "/";
    return filtered
        .map((part, index) => index === 0
            ? part.replace(/[\\/]+$/g, "")
            : part.replace(/^[\\/]+|[\\/]+$/g, ""))
        .filter(Boolean)
        .join(separator);
}

export function resolveResourcePath(filePath: string) {
    if (isAbsolutePath(filePath)) return filePath;
    if (!resourceRoot) throw new Error(translate("startup.resource_root_uninitialized"));
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
    if (/^(?:data:|https?:|file:)/i.test(filePath)) return filePath;
    const normalized = filePath.replace(/\\/g, "/");
    const path = normalized.replace(/^\/+/, "");
    const encodedPath = path
        .split("/")
        .map((segment, index) => index === 0 && /^[A-Za-z]:$/.test(segment)
            ? segment
            : encodeURIComponent(segment))
        .join("/");
    return `file:///${encodedPath}`;
}

function isAbsolutePath(filePath: string) {
    return /^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith("/");
}
