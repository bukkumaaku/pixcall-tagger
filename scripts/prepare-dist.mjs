import { copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveWorkerPlatform } from "./worker-platform.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(projectRoot, "dist");
const manifest = JSON.parse(await readFile(path.join(projectRoot, "manifest.json"), "utf8"));
const platform = resolveWorkerPlatform();

await mkdir(dist, { recursive: true });
await copyFile(path.join(projectRoot, "manifest.json"), path.join(dist, "manifest.json"));
await copyFile(path.join(projectRoot, "icon.png"), path.join(dist, "icon.png"));
await copyFile(path.join(projectRoot, "tagset.csv"), path.join(dist, "tagset.csv"));
await rm(path.join(dist, "icons"), { recursive: true, force: true });
await cp(path.join(projectRoot, "icons"), path.join(dist, "icons"), { recursive: true });
await rm(path.join(dist, "l10n"), { recursive: true, force: true });
await cp(path.join(projectRoot, "l10n"), path.join(dist, "l10n"), { recursive: true });
const localeFiles = (await readdir(path.join(projectRoot, "l10n"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name);
if (localeFiles.length === 0) {
    throw new Error("l10n must contain at least one JSON locale");
}
if (!localeFiles.includes(`${manifest.default_locale}.json`)) {
    throw new Error(`default locale is missing: ${manifest.default_locale}`);
}
for (const localeFile of localeFiles) {
    const localePath = path.join(dist, "l10n", localeFile);
    const localeStat = await stat(localePath).catch(() => null);
    if (!localeStat?.isFile() || localeStat.size === 0) {
        throw new Error(`required locale artifact is missing or empty: ${localePath}`);
    }
    const locale = JSON.parse(await readFile(localePath, "utf8"));
    const flatLocale = {};
    const flatten = (value, prefix = "") => {
        if (typeof value === "string") {
            if (prefix) flatLocale[prefix] = value;
            return;
        }
        if (!value || typeof value !== "object" || Array.isArray(value)) return;
        for (const [key, child] of Object.entries(value)) {
            flatten(child, prefix ? `${prefix}.${key}` : key);
        }
    };
    flatten(locale);
    await writeFile(localePath, `${JSON.stringify(flatLocale, null, 2)}\n`, "utf8");
}

const assetsDirectory = path.join(dist, "assets");
const assetEntries = await readdir(assetsDirectory, { withFileTypes: true });
const allAssetNames = assetEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
const activeAssets = new Set();
const assetQueue = [];
const queuedAssets = new Set();

function registerAsset(reference) {
    const normalized = reference.replace(/\\/g, "/").replace(/^\.\//, "");
    const assetName = normalized.startsWith("assets/")
        ? normalized.slice("assets/".length)
        : path.basename(normalized);
    if (!allAssetNames.includes(assetName) || queuedAssets.has(assetName)) return;
    queuedAssets.add(assetName);
    assetQueue.push(assetName);
}

const indexHtml = await readFile(path.join(dist, "index.html"), "utf8");
for (const match of indexHtml.matchAll(/\.\/assets\/([^"']+)/g)) {
    registerAsset(match[1]);
}

while (assetQueue.length > 0) {
    const assetName = assetQueue.shift();
    if (!assetName) continue;
    activeAssets.add(assetName);
    const assetPath = path.join(assetsDirectory, assetName);
    const assetContent = await readFile(assetPath, "utf8").catch(() => null);
    if (!assetContent) continue;

    for (const candidate of allAssetNames) {
        if (!activeAssets.has(candidate) && assetContent.includes(candidate)) {
            registerAsset(candidate);
        }
    }
}

for (const entry of assetEntries) {
    if (entry.isFile() && !activeAssets.has(entry.name)) {
        await rm(path.join(assetsDirectory, entry.name), { force: true });
    }
}

await rm(path.join(dist, "bin"), { recursive: true, force: true });
await cp(path.join(projectRoot, "bin"), path.join(dist, "bin"), { recursive: true });

const requiredFiles = [path.join("bin", platform.directory, platform.executable)];
if (platform.nodePlatform === "win32") {
    requiredFiles.push(path.join("bin", platform.directory, "DirectML.dll"));
}
for (const relativePath of requiredFiles) {
    const artifactPath = path.join(dist, relativePath);
    const artifact = await stat(artifactPath).catch(() => null);
    if (!artifact?.isFile() || artifact.size === 0) {
        throw new Error(`required build artifact is missing or empty: ${artifactPath}`);
    }
}

console.log(`prepared Pixcall plugin at ${dist}`);
