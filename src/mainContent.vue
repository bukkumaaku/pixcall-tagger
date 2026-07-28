<script setup lang="ts">
    import wdTypeTagger from "./components/wdTypeTagger.vue";
    import llmTypeTagger from "./components/llmTypeTagger.vue";
    import semanticSearch from "./components/semanticSearch.vue";
    import oneClickWorkflow from "./components/oneClickWorkflow.vue";
    import settingsPanel from "./components/settingsPanel.vue";
    import taskCenter from "./components/taskCenter.vue";
    import {
        type MenuOption,
        NLayoutSider,
        NMenu,
        NLayout,
        NIcon,
    } from "naive-ui";
    import {
        PricetagsOutline,
        MenuOutline,
        SettingsOutline,
        SparklesOutline,
        ImagesOutline,
        FlashOutline,
    } from "@vicons/ionicons5";
    import { computed, h, onMounted, ref, type Component } from "vue";
    import { backenAPI, t, dialog, config, notification } from "./api/backen";
    import { isTaskRunning } from "./services/taskCenter";
    import { preloadSemanticIndexStatus } from "./services/semanticIndexStatus";

    const collapsed = ref(true);
    const currentPage = ref("wdtype");
    const pageComponents = {
        wdtype: wdTypeTagger,
        llmtype: llmTypeTagger,
        "semantic-search": semanticSearch,
        "one-click-workflow": oneClickWorkflow,
        settings: settingsPanel,
    };
    const currentComponent = computed(
        () => pageComponents[currentPage.value as keyof typeof pageComponents],
    );
    let updateCheckStarted = false;
    let semanticPreloadTimer: ReturnType<typeof setTimeout> | undefined;

    function scheduleSemanticIndexPreload() {
        if (semanticPreloadTimer) clearTimeout(semanticPreloadTimer);
        semanticPreloadTimer = setTimeout(() => {
            semanticPreloadTimer = undefined;
            if (backenAPI.is_processing) {
                scheduleSemanticIndexPreload();
                return;
            }
            void preloadSemanticIndexStatus();
        }, 1500);
    }

    async function openReleasePage(url: string) {
        await eagle.shell.openExternal(url);
    }

    async function checkForUpdate() {
        if (updateCheckStarted) return;
        updateCheckStarted = true;
        try {
            const result = await backenAPI.checkForUpdate();
            if (!result.updateAvailable) return;
            dialog.warning({
                title: t.value("update.title"),
                content:
                    `${t.value("update.current_version")}${result.currentVersion}` +
                    `${t.value("update.latest_version")}${result.latestVersion}` +
                    t.value("update.open_prompt"),
                positiveText: t.value("update.open_release"),
                negativeText: t.value("update.later"),
                onPositiveClick: async () => {
                    try {
                        await openReleasePage(result.releaseUrl);
                    } catch (error) {
                        notification(
                            `${t.value("update.open_failed")}: ${error instanceof Error ? error.message : String(error)}`,
                            "error",
                        );
                    }
                },
            });
        } catch (error) {
            updateCheckStarted = false;
            console.warn("检查更新失败", error);
        }
    }

    async function chooseModelLocation() {
        const result = await eagle.dialog.showOpenDialog({
            properties: ["openDirectory"],
        });

        if (result.canceled || !result.filePaths?.[0]) {
            notification(t.value("startup.model_location_required"), "warning");
            return false;
        }

        config.modelLocation = result.filePaths[0];
        await backenAPI.setConfig();
        return true;
    }

    const renderIcon = (icon: Component) => {
        return () => h(NIcon, null, { default: () => h(icon) });
    };

    const menuOptions = computed<MenuOption[]>(() => [
        {
            label: t.value("nav.wd"),
            key: "wdtype",
            icon: renderIcon(PricetagsOutline),
        },
        {
            label: t.value("nav.llm"),
            key: "llmtype",
            icon: renderIcon(SparklesOutline),
        },
        {
            label: t.value("nav.semantic_search"),
            key: "semantic-search",
            icon: renderIcon(ImagesOutline),
        },
        {
            label: t.value("nav.one_click_workflow"),
            key: "one-click-workflow",
            icon: renderIcon(FlashOutline),
        },
        {
            label: t.value("nav.settings"),
            key: "settings",
            icon: renderIcon(SettingsOutline),
        },
    ]);

    const clickOption = (key: string) => {
        if ((backenAPI.is_processing || isTaskRunning.value) && key !== currentPage.value) {
            notification(
                t.value("model_download_window.process_checking"),
                "warning",
            );
            return;
        }
        currentPage.value = key;
    };

    onMounted(async () => {
        await backenAPI.getConfig();
        if (!config.modelLocation) {
            if (await chooseModelLocation()) {
                scheduleSemanticIndexPreload();
                void checkForUpdate();
            }
        } else {
            scheduleSemanticIndexPreload();
            void checkForUpdate();
        }
    });
</script>

<template style="height: 100%">
    <n-layout has-sider style="height: 100%; padding-top: 30px">
        <n-layout has-sider style="height: 100%">
            <n-layout-sider
                bordered
                collapse-mode="width"
                :collapsed-width="64"
                :width="240"
                :collapsed="collapsed"
                @collapse="collapsed = true"
                @expand="collapsed = false"
            >
                <button
                    type="button"
                    class="sider-toggle"
                    :class="{ 'sider-toggle--collapsed': collapsed }"
                    :title="collapsed ? t('nav.expand') : t('nav.collapse')"
                    @click="collapsed = !collapsed"
                >
                    <n-icon
                        :size="22"
                        :style="{
                            transform: collapsed
                                ? 'rotate(0deg)'
                                : 'rotate(90deg)',
                            transition:
                                'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        }"
                    >
                        <MenuOutline />
                    </n-icon>
                </button>
                <n-menu
                    :value="currentPage"
                    :collapsed="collapsed"
                    :collapsed-width="64"
                    :collapsed-icon-size="22"
                    :options="menuOptions"
                    @update:value="clickOption"
                />
            </n-layout-sider>
            <n-layout>
                <KeepAlive>
                    <component :is="currentComponent" />
                </KeepAlive>
            </n-layout>
        </n-layout>
    </n-layout>
    <taskCenter />
</template>

<style scoped>
    .sider-toggle {
        width: 100%;
        height: 42px;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        padding: 0 0 0 32px !important;
        border: 0;
        border-radius: 0;
        background: transparent !important;
        color: inherit;
        cursor: pointer;
        transition: padding-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .sider-toggle--collapsed {
        padding-left: 21px !important;
    }
</style>
