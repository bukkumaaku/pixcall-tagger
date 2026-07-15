import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(projectRoot, "dist");

await mkdir(dist, { recursive: true });
await copyFile(path.join(projectRoot, "manifest.json"), path.join(dist, "manifest.json"));
await copyFile(path.join(projectRoot, "icon.png"), path.join(dist, "icon.png"));
await copyFile(path.join(projectRoot, "tagset.csv"), path.join(dist, "tagset.csv"));
await rm(path.join(dist, "icons"), { recursive: true, force: true });
await cp(path.join(projectRoot, "icons"), path.join(dist, "icons"), { recursive: true });
await rm(path.join(dist, "l10n"), { recursive: true, force: true });
await cp(path.join(projectRoot, "l10n"), path.join(dist, "l10n"), { recursive: true });
try {
    await rm(path.join(dist, "bin"), { recursive: true, force: true });
    await cp(path.join(projectRoot, "bin"), path.join(dist, "bin"), { recursive: true });
} catch (error) {
    if (error?.code === "EPERM" || error?.code === "EBUSY") {
        console.warn("worker is in use; keeping the existing dist/bin until the next build");
    } else {
        throw error;
    }
}

console.log(`prepared Pixcall plugin at ${dist}`);
