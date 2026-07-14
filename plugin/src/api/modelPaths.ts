import { config } from "./backen";
import { joinPath } from "../services/pathUtils";

export type ModelCategory = "wd" | "llm" | "embedding" | "llamafile";

export function categoryDirectory(category: ModelCategory): string {
    return joinPath(config.modelLocation || "", category);
}

export function modelDirectory(
    category: Exclude<ModelCategory, "llamafile">,
    modelName: string,
): string {
    return joinPath(categoryDirectory(category), modelName);
}

export function modelResourcePath(
    category: Exclude<ModelCategory, "llamafile">,
    modelName: string,
    filename: string,
): string {
    return joinPath(modelDirectory(category, modelName), filename);
}

export function llamafilePath(filename: string): string {
    return joinPath(categoryDirectory("llamafile"), filename);
}
