import zhCN from "../../l10n/zh-CN.json";
import en from "../../l10n/en.json";

let messages: unknown = zhCN;

export async function initializeI18n() {
    const settings = await Promise.race([
        window.pixcall?.getContext("settings").catch(() => null) ?? Promise.resolve(null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 300)),
    ]);
    const record = settings && typeof settings === "object"
        ? settings as Record<string, unknown>
        : {};
    const locale = String(
        record.locale || record.language || record.app_language || navigator.language || "zh-CN",
    ).toLowerCase();
    messages = locale.startsWith("zh") ? zhCN : en;
}

export function translate(key: string) {
    let value: unknown = messages;
    for (const part of key.split(".")) {
        if (!value || typeof value !== "object" || !(part in value)) return key;
        value = (value as Record<string, unknown>)[part];
    }
    return typeof value === "string" ? value : key;
}
