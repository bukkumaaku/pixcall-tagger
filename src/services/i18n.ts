import zhCN from "../../_locales/zh_CN.json";

export function translate(key: string) {
    let value: unknown = zhCN;
    for (const part of key.split(".")) {
        if (!value || typeof value !== "object" || !(part in value)) return key;
        value = (value as Record<string, unknown>)[part];
    }
    return typeof value === "string" ? value : key;
}
