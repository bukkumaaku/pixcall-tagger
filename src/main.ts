import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { getBackendClient } from "./services/backendClient";
import { installPixcallHost } from "./services/pixcallClient";
import { initializeRuntimePaths } from "./services/pathUtils";
import { initializeI18n, translate } from "./services/i18n";

async function bootstrap() {
    installPixcallHost();
    await initializeI18n();
    await initializeRuntimePaths();
    const backend = getBackendClient();
    backend.start();
    const disposeWorker = () => backend.dispose();
    window.addEventListener("beforeunload", disposeWorker, { once: true });
    window.addEventListener("pagehide", disposeWorker, { once: true });
    createApp(App).mount("#app");
}

void bootstrap().catch((error) => {
    console.error("Failed to initialize Pixcall AI Tagger", error);
    document.querySelector("#app")!.textContent = translate("startup.initialization_failed", {
        error: error instanceof Error ? error.message : String(error),
    });
});
