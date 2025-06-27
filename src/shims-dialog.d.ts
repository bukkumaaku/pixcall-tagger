declare module "@tauri-apps/api/dialog" {
	export function open(options: any): Promise<string | string[] | null>;
}
