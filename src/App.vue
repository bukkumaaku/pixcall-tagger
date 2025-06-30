<script setup lang="ts">
import { ref, onMounted, Ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { PixcallTagger } from "./api";
import { BaseDirectory, open as openFile, exists as fileExists, mkdir } from "@tauri-apps/plugin-fs";
import { load, Store } from "@tauri-apps/plugin-store";
import { listen } from "@tauri-apps/api/event";
import { tagset } from "./tagset";

import {
	NForm,
	NFormItem,
	NSelect,
	NButton,
	NMessageProvider,
	NSpace,
	NProgress,
	NInputNumber,
	useMessage,
	useDialog,
	NRadioGroup,
	NRadio,
	NInput,
} from "naive-ui";

interface FormData {
	modelOptions: string;
	threshold: number;
	batchSize: number;
	overwrite: string;
	language: string;
	splitter: string;
	filterTags: string[];
}

const api = new PixcallTagger();
const message = useMessage();
const dialog = useDialog();
let store: Store;

// 表单数据
const formData: Ref<FormData> = ref({
	modelOptions: "",
	threshold: 0.25,
	batchSize: 4,
	overwrite: "nocover",
	language: "zh",
	splitter: "|",
	filterTags: [],
});

listen("addnumber", (event) => {
	completedPic.value += event.payload as number;
});

// 执行打标
async function tagImages() {
	clearInterval(timer);
	if (!formData.value.modelOptions) {
		message.error("请选择模型");
		return;
	}

	if (formData.value.modelOptions.includes("|未下载")) {
		message.error("请先下载模型");
		return;
	}

	try {
		message.info("开始打标，请稍候...");
		const fileServer = await api.get_file_server();
		const [image_id, thumb_hash] = await api.get_selected_images(formData.value);
		const all_tags_map = await api.get_all_tags();
		const tags = (await invoke("tag_images", {
			thumbHash: thumb_hash,
			tagPath: `${formData.value.modelOptions.split("/")[1]}/selected_tags.csv`,
			modelPath: `${formData.value.modelOptions.split("/")[1]}/model.onnx`,
			fileServer: fileServer,
			threshold: formData.value.threshold,
			batchSize: formData.value.batchSize,
		})) as string[][];
		for (let i = 0; i < thumb_hash.length; i++) {
			tags[i] = tags[i].filter(
				(tag: string) =>
					!formData.value.filterTags.includes(tag) && !formData.value.filterTags.includes(tagset[tag])
			);
			if (formData.value.language === "zh") {
				tags[i] = tags[i].map((tag: string) => tagset[tag]);
			} else if (formData.value.language === "mix") {
				tags[i] = tags[i].map((tag: string) => tagset[tag] + formData.value.splitter + tag);
			}
			const tag_id = await api.write_nonexist(tags[i], all_tags_map);
			await api.write_image_tags(image_id[i], tag_id);
		}
		message.success("打标完成！");
		dialog.success({
			title: "成功",
			content: "打标完成！",
			positiveText: "OK",
		});
	} catch (error) {
		message.error("打标失败: " + error);
		dialog.error({
			title: "失败",
			content: "打标失败！",
			positiveText: "OK",
		});
	}
	setTimer();
	completedPic.value = 0;
}

async function predownloadFile(name: string) {
	const folderName = name.split("/")[1];
	await mkdir(`${folderName}`, { baseDir: BaseDirectory.Resource });
	const modelUrl = `https://huggingface.co/${name}/resolve/main/model.onnx`;
	const tagUrl = `https://huggingface.co/${name}/resolve/main/selected_tags.csv`;
	const modelPath = `${folderName}/model.onnx`;
	const tagPath = `${folderName}/selected_tags.csv`;
	downloadModelProcess.value = 0;
	downloadTagProcess.value = 0;
	await downloadFilePureFrontend(modelUrl, modelPath, downloadModelProcess);
	await downloadFilePureFrontend(tagUrl, tagPath, downloadTagProcess);
	formData.value.modelOptions = name;
	saveFormData();
}

async function downloadFilePureFrontend(url: string, fileName: string, downloadProcess: Ref<number>) {
	const file = await openFile(fileName, {
		append: true,
		create: true,
		write: true,
		baseDir: BaseDirectory.Resource,
	});

	try {
		// 1. 发起 Fetch 请求
		const response = await fetch(url);
		if (!response.ok) throw new Error("下载失败");
		// 2. 获取文件大小（用于进度计算）
		const contentLength = response.headers.get("content-length");
		const totalBytes = contentLength ? parseInt(contentLength) : 0;
		let receivedBytes = 0;
		// 3. 读取流数据并监听进度
		const reader = response.body?.getReader();
		if (!reader) throw new Error("无法读取数据流");
		//const chunks: Uint8Array[] = [];
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			//chunks.push(value);
			await file.write(value);
			receivedBytes += value.length;
			// 计算并显示进度（可选）
			if (totalBytes > 0) {
				const percent = Math.round((receivedBytes / totalBytes) * 10000) / 100;
				console.log(`下载进度: ${percent}%`);
				downloadProcess.value = percent;
				// 更新 UI 进度条（示例）
			}
		}
		alert(`文件已保存到下载文件夹: ${fileName}`);
	} catch (error) {
		console.error("下载失败:", error);
		alert("下载失败，请检查链接或网络！");
	}
	file.close();
}
const modelOptions: Ref<{ label: string; value: string }[]> = ref([]);
onMounted(async () => {
	store = await load("store.json", { autoSave: true });
	if ((await store.get("formData")) === undefined) {
		await store.set("formData", {
			modelOptions: "",
			threshold: 0.25,
			batchSize: 4,
			overwrite: "nocover",
			language: "zh",
			splitter: "|",
			filterTags: [],
		});
	}
	formData.value = (await store.get("formData")) as FormData;
	const modelEmbedOptions = [
		{
			label: "SmilingWolf/wd-eva02-large-tagger-v3",
			value: "SmilingWolf/wd-eva02-large-tagger-v3",
		},
		{
			label: "SmilingWolf/wd-vit-large-tagger-v3",
			value: "SmilingWolf/wd-vit-large-tagger-v3",
		},
		{
			label: "SmilingWolf/wd-v1-4-moat-tagger-v2",
			value: "SmilingWolf/wd-v1-4-moat-tagger-v2",
		},
	];
	for (const option of modelEmbedOptions) {
		const folderName = option.value.split("/")[1];
		const modelPath = `${folderName}/model.onnx`;
		const tagPath = `${folderName}/selected_tags.csv`;
		if (
			!(await fileExists(modelPath, { baseDir: BaseDirectory.Resource })) ||
			!(await fileExists(tagPath, { baseDir: BaseDirectory.Resource }))
		) {
			option.label += "|未下载";
			option.value += "|未下载";
		}
	}
	setTimer();
	modelOptions.value = modelEmbedOptions;
	await saveFormData();
});

async function saveFormData() {
	if (formData.value.modelOptions === "SmilingWolf/wd-v1-4-moat-tagger-v2") {
		formData.value.batchSize = 1;
	}
	await store.set("formData", formData.value);
}

const downloadModelProcess = ref(0);
const downloadTagProcess = ref(0);
let timer: number | undefined;
const setTimer = () => {
	timer = setInterval(async () => {
		const [ids, _paths] = await api.get_selected_images(formData.value);
		allPic.value = ids.length;
	}, 1000);
};
const allPic = ref(0);
const completedPic = ref(0);
</script>

<template>
	<n-message-provider>
		<n-form
			:model="formData"
			label-placement="left"
			label-width="auto"
			style="width: fit-content; margin: auto auto; position: relative; margin-top: 30px"
		>
			<n-form-item label="选择图片" path="pixcall">{{ completedPic }}/{{ allPic }}</n-form-item>
			<n-form-item label="选择模型" path="modelSelect">
				<n-select :options="modelOptions" v-model:value="formData.modelOptions" @update:value="saveFormData" />
			</n-form-item>

			<n-form-item label="下载模型" path="modelDownload" v-show="formData.modelOptions.includes('|未下载')">
				<n-space vertical>
					<n-space justify="space-between">
						<span>selected_tags.csv</span>
						<n-progress
							style="width: 150px"
							type="line"
							:percentage="downloadTagProcess"
							indicator-placement="inside"
							processing
						/>
					</n-space>
					<n-space justify="space-between">
						<span>model.onnx</span>
						<n-progress
							style="width: 150px"
							type="line"
							:percentage="downloadModelProcess"
							indicator-placement="inside"
							processing
						/>
					</n-space>
					<n-button type="primary" @click="predownloadFile(formData.modelOptions.split('|')[0])">
						下载模型
					</n-button>
				</n-space>
			</n-form-item>
			<n-form-item label="阈值" path="thereshold">
				<n-input-number
					v-model:value="formData.threshold"
					placeholder="请输入阈值"
					step="0.01"
					max="1"
					min="0.01"
					@update:value="saveFormData"
				/>
			</n-form-item>
			<n-form-item label="批量大小" path="batchSize">
				<n-input-number
					v-model:value="formData.batchSize"
					placeholder="请输入批量大小"
					step="1"
					max="32"
					min="1"
					@update:value="saveFormData"
				/>
			</n-form-item>
			<!-- 是否覆写 -->
			<n-form-item label="是否覆写" path="overwrite">
				<n-radio-group v-model:value="formData.overwrite" name="overwrite" @update:value="saveFormData">
					<n-space>
						<n-radio value="nocover">不覆写</n-radio>
						<n-radio value="cover">覆写</n-radio>
						<!-- <n-radio value="merge">合并</n-radio> -->
					</n-space>
				</n-radio-group>
			</n-form-item>
			<!-- 标签语言选择 -->
			<n-form-item label="标签语言" path="language">
				<n-radio-group v-model:value="formData.language" name="language" @update:value="saveFormData">
					<n-space>
						<n-radio value="zh">中文</n-radio>
						<n-radio value="en">英文</n-radio>
						<n-radio value="mix">中文+英文</n-radio>
					</n-space>
				</n-radio-group>
			</n-form-item>
			<!-- 分隔符 -->
			<n-form-item label="分隔符" path="splitter">
				<n-input
					v-model:value="formData.splitter"
					:placeholder="formData.language === 'mix' ? '请输入分隔符' : '中文和英文标签共存才需要开启分隔符'"
					:disabled="formData.language !== 'mix'"
					@update:value="saveFormData"
				/>
			</n-form-item>
			<n-form-item label="过滤标签" path="filterTags">
				<n-select
					filterable
					multiple
					tag
					:show="false"
					:show-arrow="false"
					v-model:value="formData.filterTags"
					placeholder="输入过滤的标签，回车确认"
					@update:value="saveFormData"
				/>
			</n-form-item>
			<div style="display: flex; gap: 10px; justify-content: flex-end">
				<n-button type="primary" @click="tagImages">开始打标</n-button>
			</div>
		</n-form>
	</n-message-provider>
</template>

<style scoped>
.logo.vite:hover {
	filter: drop-shadow(0 0 2em #747bff);
}

.logo.vue:hover {
	filter: drop-shadow(0 0 2em #249b73);
}
</style>
