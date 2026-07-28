import { getPixcallContext, pixcallCommand, pixcallRequest } from "./pixcallBridge";
import { getBackendClient } from "./backendClient";
import { joinPath } from "./pathUtils";
import { translate } from "./i18n";

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
    private tagCreationQueue: Promise<void> = Promise.resolve();
    private settings: SettingsResponse | null = null;

    async request<T>(payload: Record<string, unknown>): Promise<T> {
        try {
            return await pixcallRequest<T>(payload);
        } catch (error) {
            throw new Error(translate("pixcall.connection_failed", {
                error: error instanceof Error ? error.message : String(error),
            }));
        }
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
        if (entries?.length) return this.hydrateEntries(entries);

        const initMessage = await getPixcallContext<{ data?: { selection?: string[] } }>("initMessage");
        const selection = initMessage?.data?.selection?.map(normalizeId) || [];
        if (selection.length > 0) {
            const result = await this.request<EntryListResponse>({
                type: "get_entries",
                ids: selection,
            });
            return this.hydrateEntries(result.entries || []);
        }
        return [];
    }

    async getAllItems() {
        await this.getSettings();
        const ids = await this.getAllEntryIds();
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

    async getAllItemIds() {
        await this.getSettings();
        return this.getAllEntryIds();
    }

    async getLibrarySnapshot() {
        await this.getSettings();
        const itemIds = await this.getAllEntryIds();
        const items = await this.getItems(itemIds);
        const returnedIds = new Set(items.map((item) => item.id));
        const missingIds = itemIds.filter((id) => !returnedIds.has(id));
        if (missingIds.length > 0) {
            throw new Error(translate("pixcall.snapshot_missing_items", { count: missingIds.length }));
        }
        return { items, itemIds };
    }

    private async getAllEntryIds() {
        const databaseIds = await this.getDatabaseEntryIds();
        if (databaseIds?.length) return databaseIds;

        // An empty database result is not authoritative: older Pixcall
        // schemas can be readable while the file-entry query matches nothing.
        return [...new Set(await this.getSearchEntryIds())];
    }

    private async getDatabaseEntryIds(): Promise<string[] | null> {
        const libraryPath = this.settings?.library?.path || this.settings?.library_path;
        if (!libraryPath) return null;

        const databasePath = joinPath(libraryPath, ".pixcall", "database", "main.db");
        try {
            const result = await getBackendClient().listPixcallEntryIds(databasePath);
            return [...new Set((result.ids || []).map(normalizeId))];
        } catch (error) {
            console.warn("无法读取 Pixcall 数据库，将回退到 search_entries：", error);
            return null;
        }
    }

    private async getSearchEntryIds() {
        const matches = await this.request<SearchEntry[]>({
            type: "search_entries",
            filters: {},
        });
        return (matches || [])
            .filter((entry) => !entry.is_folder)
            .map((entry) => normalizeId(entry.id));
    }

    async getItem(id: string) {
        const normalizedId = normalizeId(id);
        const cached = this.entries.get(normalizedId);
        if (cached) return this.hydrateEntry(cached);
        const items = await this.getItems([normalizedId]);
        const item = items[0];
        if (!item) throw new Error(translate("pixcall.item_not_found", { id }));
        return item;
    }

    async getItems(ids: string[]) {
        const normalizedIds = ids.map(normalizeId);
        const missingIds = [...new Set(normalizedIds.filter((id) => !this.entries.has(id)))];
        for (let offset = 0; offset < missingIds.length; offset += 500) {
            const result = await this.request<EntryListResponse>({
                type: "get_entries",
                ids: missingIds.slice(offset, offset + 500),
            });
            for (const entry of result.entries || []) {
                this.entries.set(normalizeId(entry.id), entry);
            }
        }
        const hydrated = await Promise.all(
            normalizedIds.map((id) => {
                const entry = this.entries.get(id);
                return entry ? this.hydrateEntry(entry) : null;
            }),
        );
        return hydrated.filter((item): item is PixcallItem => item !== null);
    }

    async openItem(id: string) {
        await pixcallCommand({ type: "reveal_entry", id: normalizeId(id) });
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
        throw new Error(translate("pixcall.item_path_missing", { name: entry.name || entry.id }));
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
            ids.push(await this.ensureTagId(name));
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

    private ensureTagId(name: string): Promise<string> {
        const operation = this.tagCreationQueue.then(async () => {
            await this.ensureTags();
            const cached = this.tagByName.get(name);
            if (cached) return cached;

            const result = await this.request<{ tag: PixcallTag }>({ type: "create_tag", name });
            const id = normalizeId(result.tag.id);
            this.tagByName.set(name, id);
            this.tagById.set(id, name);
            return id;
        });
        this.tagCreationQueue = operation.then(
            () => undefined,
            () => undefined,
        );
        return operation;
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
            info: async () => {
                await pixcallClient.getSettings();
                return {
                    name: pixcallClient.libraryName,
                    path: pixcallClient.libraryNamespace,
                };
            },
        },
        item: {
            getSelected: () => pixcallClient.getSelectedItems(),
            list: () => pixcallClient.getAllItems(),
            getAll: () => pixcallClient.getAllItems(),
            get: () => pixcallClient.getAllItems(),
            getAllIds: () => pixcallClient.getAllItemIds(),
            getById: (id: string) => pixcallClient.getItem(id),
            getByIds: (ids: string[]) => pixcallClient.getItems(ids),
            open: (id: string) => pixcallClient.openItem(id),
        },
        dialog: {
            showOpenDialog: async (options: { properties?: string[] }) => {
                if (!window.pixcall?.showOpenDialog) {
                    throw new Error(translate("pixcall.directory_picker_unavailable"));
                }
                return window.pixcall.showOpenDialog(options);
            },
        },
        extraModule: {
            ffmpeg: {
                isInstalled: async () => {
                    const tools = await getBackendClient().systemTools();
                    return Boolean(tools.ffmpegPath && tools.ffprobePath);
                },
                getPaths: async () => {
                    const tools = await getBackendClient().systemTools();
                    if (!tools.ffmpegPath || !tools.ffprobePath) {
                        throw new Error(translate("pixcall.ffmpeg_not_found"));
                    }
                    return { ffmpeg: tools.ffmpegPath, ffprobe: tools.ffprobePath };
                },
            },
        },
        window: {
            minimize: async () => undefined,
            hide: async () => undefined,
        },
        shell: { openExternal: async (url: string) => { await pixcallCommand({ type: "open_url", url }); } },
    };
    (globalThis as typeof globalThis & { eagle: typeof host }).eagle = host;
    (window as typeof window & { eagle: typeof host }).eagle = host;
}
