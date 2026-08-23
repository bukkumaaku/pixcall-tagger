import type { PixcallItem } from "./services/pixcallClient";

declare global {
    const eagle: {
        library: {
            name: string;
            path: string;
            info(): Promise<{ name: string; path: string }>;
        };
        item: {
            getSelected(): Promise<PixcallItem[]>;
            list(options?: { limit?: number }): Promise<PixcallItem[]>;
            getAll(): Promise<PixcallItem[]>;
            getAllIds(): Promise<string[]>;
            get(options?: unknown): Promise<PixcallItem[]>;
            getById(id: string): Promise<PixcallItem>;
            getByIds(ids: string[]): Promise<PixcallItem[]>;
            open(id: string): Promise<void>;
        };
        dialog: {
            showOpenDialog(options: { properties?: string[] }): Promise<{ canceled: boolean; filePaths: string[] }>;
        };
        extraModule: {
            ffmpeg: {
                isInstalled(): Promise<boolean>;
                getPaths(): Promise<{ ffmpeg: string; ffprobe: string }>;
            };
        };
        window: { minimize(): Promise<void>; hide(): Promise<void> };
        shell: { openExternal(url: string): Promise<void> };
    };

    interface Window {
        eagle: typeof eagle;
        pixcall?: {
            getContext(name?: string): Promise<unknown>;
            request?<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
            showOpenDialog(options: { properties?: string[] }): Promise<{ canceled: boolean; filePaths: string[] }>;
            platform: { isMacOS: boolean; isWindows: boolean; isLinux: boolean };
        };
    }
}

export {};
