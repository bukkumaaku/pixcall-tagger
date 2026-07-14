<script setup lang="ts">
    import {
        NConfigProvider,
        NNotificationProvider,
        NDialogProvider,
        darkTheme,
        NGlobalStyle,
        NIcon,
    } from "naive-ui";
    import { CloseOutline } from "@vicons/ionicons5";
    import pluginIconUrl from "../icon.png";
    import MainContent from "./mainContent.vue";
    import { closePixcallWindow } from "./services/pixcallBridge";
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
                        <button type="button" class="titlebar__close" title="关闭" @click="closePixcallWindow">
                            <n-icon :size="20"><CloseOutline /></n-icon>
                        </button>
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
        height: 42px;
        flex: 0 0 42px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-left: 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.09);
        background: #18181c;
        color: rgba(255, 255, 255, 0.9);
        -webkit-app-region: drag;
        user-select: none;
    }
    .titlebar__identity {
        display: flex;
        align-items: center;
        gap: 9px;
        font-size: 13px;
        font-weight: 600;
    }
    .titlebar__identity img {
        width: 20px;
        height: 20px;
    }
    .titlebar__close {
        width: 46px;
        height: 42px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        -webkit-app-region: no-drag;
    }
    .titlebar__close:hover {
        background: #c42b1c;
        color: #fff;
    }
</style>
