<script setup lang="ts">
    import {
        NConfigProvider,
        NNotificationProvider,
        NDialogProvider,
        darkTheme,
        NGlobalStyle,
        NIcon,
    } from "naive-ui";
    import { CloseOutline, RemoveOutline } from "@vicons/ionicons5";
    import pluginIconUrl from "../icon.png";
    import MainContent from "./mainContent.vue";
    import { closePixcallWindow } from "./services/pixcallBridge";
    import { getBackendClient } from "./services/backendClient";

    const minimizeWindow = async () => {
        const result = await getBackendClient().minimizePluginWindow();
        if (!result.minimized) console.warn("Pixcall plugin window was not found");
    };
</script>

<template>
    <n-config-provider :theme="darkTheme">
        <n-global-style />
        <n-dialog-provider>
            <n-notification-provider placement="bottom-right">
                <div class="app-shell">
                    <header class="titlebar">
                        <div class="titlebar__identity">
                            <img :src="pluginIconUrl" alt="" draggable="false" />
                            <span>AI 自动标签</span>
                        </div>
                        <div class="titlebar__actions">
                            <button type="button" class="titlebar__button" title="最小化" @click="minimizeWindow">
                                <n-icon :size="18"><RemoveOutline /></n-icon>
                            </button>
                            <button type="button" class="titlebar__button titlebar__close" title="关闭" @click="closePixcallWindow">
                                <n-icon :size="18"><CloseOutline /></n-icon>
                            </button>
                        </div>
                    </header>
                    <MainContent id="mainContent" />
                </div>
            </n-notification-provider>
        </n-dialog-provider>
    </n-config-provider>
</template>

<style scoped>
    #mainContent {
        min-height: 0;
        flex: 1;
    }
    .n-config-provider {
        height: 100%;
    }
    .app-shell {
        height: 100%;
        display: flex;
        flex-direction: column;
    }
    .titlebar {
        height: 30px;
        flex: 0 0 30px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-left: 10px;
        border-bottom: 2px solid rgb(31, 34, 37);
        background: #18181c;
        color: rgba(255, 255, 255, 0.9);
        -webkit-app-region: drag;
        user-select: none;
    }
    .titlebar__identity {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
    }
    .titlebar__identity img {
        width: 18px;
        height: 18px;
    }
    .titlebar__actions {
        height: 30px;
        display: flex;
        -webkit-app-region: no-drag;
    }
    .titlebar__button {
        width: 40px;
        height: 30px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
    }
    .titlebar__button:hover {
        background: rgba(255, 255, 255, 0.1);
    }
    .titlebar__button.titlebar__close:hover {
        background: #c42b1c;
        color: #fff;
    }
</style>
