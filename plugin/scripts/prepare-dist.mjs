import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(pluginRoot, "..");
const dist = path.join(pluginRoot, "dist");

await mkdir(dist, { recursive: true });
await copyFile(path.join(pluginRoot, "manifest.json"), path.join(dist, "manifest.json"));
await copyFile(path.join(pluginRoot, "icon.png"), path.join(dist, "icon.png"));
await copyFile(path.join(projectRoot, "tagset.csv"), path.join(dist, "tagset.csv"));
await rm(path.join(dist, "l10n"), { recursive: true, force: true });
await cp(path.join(pluginRoot, "l10n"), path.join(dist, "l10n"), { recursive: true });
await rm(path.join(dist, "bin"), { recursive: true, force: true });
await cp(path.join(projectRoot, "bin"), path.join(dist, "bin"), { recursive: true });

console.log(`prepared Pixcall plugin at ${dist}`);
