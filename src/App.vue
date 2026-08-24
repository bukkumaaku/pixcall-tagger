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
    import MainContent from "./mainContent.vue";
    import { closePixcallWindow } from "./services/pixcallBridge";
    import { getBackendClient } from "./services/backendClient";
    import { t } from "./api/backen";

    const minimizeWindow = async () => {
        const result = await getBackendClient().minimizePluginWindow();
        if (!result.minimized) console.warn("Pixcall plugin window was not found");
    };

    const closeWindow = async () => {
        await closePixcallWindow();
    };
</script>

<template>
    <n-config-provider :theme="darkTheme">
        <n-global-style />
        <n-dialog-provider>
            <n-notification-provider placement="bottom-right">
                <header class="titlebar">
                    <div class="titlebar__identity">{{ t("index.title") }}</div>
                    <div class="titlebar__actions">
                        <button type="button" class="titlebar__button" :title="t('window.minimize')" @click="minimizeWindow">
                            <n-icon :size="18"><RemoveOutline /></n-icon>
                        </button>
                        <button type="button" class="titlebar__button titlebar__close" :title="t('window.close')" @click="closeWindow">
                            <n-icon :size="18"><CloseOutline /></n-icon>
                        </button>
                    </div>
                </header>
                <MainContent id="mainContent" />
            </n-notification-provider>
        </n-dialog-provider>
    </n-config-provider>
</template>

<style scoped>
    #mainContent {
        height: 100%;
    }
    .n-config-provider {
        height: 100%;
    }
    .titlebar {
        width: 100%;
        height: 30px;
        position: fixed;
        top: 0;
        left: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-left: 10px;
        border-bottom: 2px solid rgb(31, 34, 37);
        color: rgba(255, 255, 255, 0.9);
        -webkit-app-region: drag;
        user-select: none;
    }
    .titlebar__identity {
        display: flex;
        align-items: center;
        height: 30px;
        line-height: 30px;
        font-size: 13px;
        font-weight: 600;
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
