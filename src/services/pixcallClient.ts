import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { fetch } from "@tauri-apps/plugin-http";
import { openUrl } from "@tauri-apps/plugin-opener";

const API_URL = "http://127.0.0.1:22510/request";

export type PixcallEntry = {
    id: string;
    name: string;
    content_hash?: string;
    content_type?: string;
    source_path?: string | null;
    tags?: string | null;
    tag_ids?: string[];
    description?: string | null;
    mtime?: string | number;
    updated_at?: string;
    image_width?: number;
    image_height?: number;
    metadata?: {
        image_width?: number;
        image_height?: number;
    };
};

type PixcallTag = { id: string; name: string };
type TagListResponse = { tags: PixcallTag[] };
type EntryListResponse = { entries: PixcallEntry[] };
type SearchEntry = { id: string; is_folder: boolean };
type SettingsResponse = {
    file_server?: string;
    library_path?: string;
    library_name?: string;
    library?: { id?: string; path?: string };
};

export type PixcallItem = {
    id: string;
    name: string;
    ext: string;
    tags: string[];
    annotation: string;
    filePath: string;
    thumbnailPath: string;
    modifiedAt: number;
    width?: number;
    height?: number;
    isDeleted: boolean;
    save(): Promise<void>;
};

class PixcallClient {
    private entries = new Map<string, PixcallEntry>();
    private tagById = new Map<string, string>();
    private tagByName = new Map<string, string>();
    private settings: SettingsResponse | null = null;

    async request<T>(payload: Record<string, unknown>): Promise<T> {
        let response: Response;
        try {
            response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
        } catch (error) {
            throw new Error(`无法连接 Pixcall，请确认 Pixcall 正在运行：${error instanceof Error ? error.message : String(error)}`);
        }
        if (!response.ok) throw new Error(`Pixcall API 返回 HTTP ${response.status}`);
        const text = await response.text();
        if (!text) return null as T;
        return JSON.parse(text) as T;
    }

    async getSettings() {
        this.settings ??= await this.request<SettingsResponse>({ type: "get_settings" });
        return this.settings;
    }

    get libraryNamespace() {
        const identity = this.settings?.library?.id || this.settings?.library?.path || "default";
        return `pixcall:${identity}`;
    }

    get libraryName() {
        return this.settings?.library_name || "Pixcall";
    }

    async getSelectedItems() {
        await this.getSettings();
        const entries = await this.request<PixcallEntry[]>({ type: "get_selected_entries" });
        return this.hydrateEntries(entries || []);
    }

    async getAllItems() {
        await this.getSettings();
        const matches = await this.request<SearchEntry[]>({
            type: "search_entries",
            filters: {},
        });
        const ids = (matches || [])
            .filter((entry) => !entry.is_folder)
            .map((entry) => normalizeId(entry.id));
        if (ids.length === 0) return [];
        const entries: PixcallEntry[] = [];
        for (let offset = 0; offset < ids.length; offset += 500) {
            const result = await this.request<EntryListResponse>({
                type: "get_entries",
                ids: ids.slice(offset, offset + 500),
            });
            entries.push(...(result.entries || []));
        }
        return this.hydrateEntries(entries);
    }

    async getItem(id: string) {
        const cached = this.entries.get(id);
        if (cached) return this.hydrateEntry(cached);
        const entries = await this.getSelectedItems();
        const item = entries.find((candidate) => candidate.id === id);
        if (!item) throw new Error(`Pixcall 中找不到条目 ${id}`);
        return item;
    }

    async getItems(ids: string[]) {
        const resolved = await Promise.all(ids.map((id) => this.getItem(id).catch(() => null)));
        return resolved.filter((item): item is PixcallItem => item !== null);
    }

    async openItem(id: string) {
        await this.request({ type: "open_entry", id });
    }

    private async hydrateEntries(entries: PixcallEntry[]) {
        await this.ensureTags();
        return Promise.all(entries.map((entry) => this.hydrateEntry(entry)));
    }

    private async hydrateEntry(entry: PixcallEntry): Promise<PixcallItem> {
        const id = normalizeId(entry.id);
        this.entries.set(id, entry);
        await this.ensureTags();
        const filePath = await this.resolveEntryPath(entry);
        const tagIds = entry.tag_ids?.length
            ? entry.tag_ids
            : String(entry.tags || "").split("|").filter(Boolean);
        const item: PixcallItem = {
            id,
            name: entry.name || id,
            ext: extensionFrom(entry),
            tags: tagIds.map((id) => this.tagById.get(normalizeId(id))).filter((tag): tag is string => Boolean(tag)),
            annotation: entry.description || "",
            filePath,
            thumbnailPath: filePath,
            modifiedAt: Number(String(entry.mtime || "").replace(/^~n/, "")) || Date.parse(entry.updated_at || "") || 0,
            width: entry.image_width ?? entry.metadata?.image_width,
            height: entry.image_height ?? entry.metadata?.image_height,
            isDeleted: false,
            save: async () => {
                await this.saveItem(item);
            },
        };
        return item;
    }

    private async resolveEntryPath(entry: PixcallEntry) {
        if (entry.source_path) return entry.source_path;
        const result = await this.request<unknown>({
            type: "get_entry_path",
            id: normalizeId(entry.id),
        });
        if (typeof result === "string") return result;
        if (result && typeof result === "object") {
            const record = result as Record<string, unknown>;
            for (const key of ["path", "file_path", "filePath", "source_path"]) {
                if (typeof record[key] === "string") return record[key] as string;
            }
        }
        throw new Error(`Pixcall 未返回条目 ${entry.name || entry.id} 的本地文件路径`);
    }

    private async ensureTags() {
        if (this.tagById.size > 0) return;
        const result = await this.request<TagListResponse>({ type: "get_all_tags" });
        for (const tag of result.tags || []) {
            const id = normalizeId(tag.id);
            this.tagById.set(id, tag.name);
            this.tagByName.set(tag.name, id);
        }
    }

    private async saveItem(item: PixcallItem) {
        await this.ensureTags();
        const ids: string[] = [];
        for (const name of item.tags) {
            let id = this.tagByName.get(name);
            if (!id) {
                const result = await this.request<{ tag: PixcallTag }>({ type: "create_tag", name });
                id = normalizeId(result.tag.id);
                this.tagByName.set(name, id);
                this.tagById.set(id, name);
            }
            ids.push(id);
        }
        const result = await this.request<unknown>({
            type: "update_entry",
            id: item.id,
            tags: ids.map((value) => ({ type: "id", value })),
            description: item.annotation,
        });
        if (typeof result === "string" && result) throw new Error(result);
        const entry = this.entries.get(item.id);
        if (entry) {
            entry.tags = ids.join("|");
            entry.tag_ids = ids;
            entry.description = item.annotation;
        }
    }
}

function normalizeId(id: string) {
    return id.replace(/^~n/, "");
}

function extensionFrom(entry: PixcallEntry) {
    const nameExtension = entry.name.match(/\.([^.]+)$/)?.[1];
    if (nameExtension) return nameExtension.toLowerCase();
    return entry.content_type?.split("/").pop()?.toLowerCase() || "";
}

export const pixcallClient = new PixcallClient();

export function installPixcallHost() {
    const host = {
        library: {
            get name() { return pixcallClient.libraryName; },
            get path() { return pixcallClient.libraryNamespace; },
        },
        item: {
            getSelected: () => pixcallClient.getSelectedItems(),
            getAll: () => pixcallClient.getAllItems(),
            get: () => pixcallClient.getAllItems(),
            getById: (id: string) => pixcallClient.getItem(id),
            getByIds: (ids: string[]) => pixcallClient.getItems(ids),
            open: (id: string) => pixcallClient.openItem(id),
        },
        dialog: {
            showOpenDialog: async (options: { properties?: string[] }) => {
                const directory = options.properties?.includes("openDirectory") ?? false;
                const selected = await open({ directory, multiple: false });
                return { canceled: !selected, filePaths: selected ? [selected] : [] };
            },
        },
        extraModule: {
            ffmpeg: {
                isInstalled: async () => false,
                getPaths: async () => { throw new Error("Pixcall 版本暂未配置 FFmpeg"); },
            },
        },
        window: {
            minimize: () => getCurrentWindow().minimize(),
            hide: () => getCurrentWindow().close(),
        },
        shell: { openExternal: (url: string) => openUrl(url) },
    };
    (globalThis as typeof globalThis & { eagle: typeof host }).eagle = host;
    (window as typeof window & { eagle: typeof host }).eagle = host;
}
