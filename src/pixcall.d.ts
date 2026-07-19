import type { PixcallItem } from "./services/pixcallClient";

declare global {
    const eagle: {
        library: { name: string; path: string };
        item: {
            getSelected(): Promise<PixcallItem[]>;
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
            getContext(name: "settings" | "serverPort" | "initMessage"): Promise<unknown>;
            showOpenDialog(options: { properties?: string[] }): Promise<{ canceled: boolean; filePaths: string[] }>;
            platform: { isMacOS: boolean; isWindows: boolean; isLinux: boolean };
        };
    }
}

export {};
