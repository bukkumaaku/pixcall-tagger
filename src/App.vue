<script setup lang="ts">
import { ref, onMounted, Ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { PixcallTagger } from "./api";
import { BaseDirectory, exists as fileExists, mkdir, readDir, exists } from "@tauri-apps/plugin-fs";
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
	NCard,
	NModal,
	NSwitch,
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
			tagPath: `models/${formData.value.modelOptions}/selected_tags.csv`,
			modelPath: `models/${formData.value.modelOptions}/model.onnx`,
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
	let model_name = name.split("/").pop()!;
	console.log(model_name);
	downloadStatus.value = true;
	const folderName = "models/" + model_name;
	try {
		if (!(await exists(folderName, { baseDir: BaseDirectory.Resource })))
			await mkdir(`${folderName}`, { baseDir: BaseDirectory.Resource });
	} catch (error) {
		console.log(error);
	}

	downloadModelProcess.value = 0;
	downloadTagProcess.value = 0;
	await downloadFromRust(name, "selected_tags.csv", downloadTagProcess, isProxy);
	await downloadFromRust(name, "model.onnx", downloadModelProcess, isProxy);
	formData.value.modelOptions = model_name;
	await saveFormData();
	downloadStatus.value = false;
	await loadModelOptions();
}

let tmp_process;

listen("download_progress", (event) => {
	console.log(event.payload);
	tmp_process!.value = parseInt(event.payload as string);
});

async function downloadFromRust(
	modelName: string,
	fileName: string,
	download_process: Ref<number>,
	isProxy: Ref<boolean>
) {
	tmp_process = download_process;
	console.log(
		await invoke("download_file", {
			modelName: modelName,
			fileName: fileName,
			isProxy: isProxy.value,
		})
	);
	download_process.value = 100;
	dialog.success({ title: "下载成功", content: `文件已保存到下载文件夹: ${fileName}` });
}

const modelOptions: Ref<{ label: string; value: string }[]> = ref([]);
const modelExsits = async (name: string) => {
	const modelPath = `models/${name}/model.onnx`;
	const tagPath = `models/${name}/selected_tags.csv`;
	return (
		(await fileExists(modelPath, { baseDir: BaseDirectory.Resource })) &&
		(await fileExists(tagPath, { baseDir: BaseDirectory.Resource }))
	);
};
async function loadModelOptions() {
	const modelList: { name: string; isDirectory: boolean; isFile: boolean; isSymlink: boolean }[] = await readDir(
		"models",
		{ baseDir: BaseDirectory.Resource }
	);
	const modelEmbedOptions = [];
	for (const item of modelList) {
		if (!item.isDirectory) {
			continue;
		}
		if (await modelExsits(item.name)) {
			modelEmbedOptions.push({
				label: item.name,
				value: item.name,
			});
		}
	}
	modelOptions.value = modelEmbedOptions;
}
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
	try {
		if (!(await exists(`models`, { baseDir: BaseDirectory.Resource }))) {
			await mkdir(`models`, { baseDir: BaseDirectory.Resource });
		}
	} catch (error) {
		console.log(error);
	}
	await loadModelOptions();
	formData.value = (await store.get("formData")) as FormData;
	if (
		modelOptions.value.length === 0 ||
		modelOptions.value.filter((item) => {
			return item.value === formData.value.modelOptions;
		}).length === 0
	) {
		dialog.info({
			title: "请先下载模型！",
			content:
				"下载模型有两种方法：\n\n1、clone模型到该程序models文件夹下，或直接下载model.onnx和selected_tags.csv文件到models文件夹下的对应文件夹内（速度较快）；\n\n2、直接在本页面下载模型（速度慢，但简单）。",
			positiveText: "OK",
			contentStyle: "white-space: pre-line",
		});
		formData.value.modelOptions = "";
	}
	setTimer();
	await saveFormData();
});

async function saveFormData() {
	if (formData.value.modelOptions === "wd-v1-4-moat-tagger-v2") {
		formData.value.batchSize = 1;
	}
	await store.set("formData", formData.value);
}

const downloadModelProcess = ref(0);
const downloadTagProcess = ref(0);
const showDownloadDialog = ref(false);
const selectedDownloadModel = ref("SmilingWolf/wd-v1-4-moat-tagger-v2");
const downloadStatus = ref(false);
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
let timer: number | undefined;
const setTimer = () => {
	timer = setInterval(async () => {
		const [ids, _paths] = await api.get_selected_images(formData.value);
		allPic.value = ids.length;
	}, 1000);
};
const allPic = ref(0);
const completedPic = ref(0);
const isProxy = ref(false);
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
				<n-button @click="showDownloadDialog = true">下载模型</n-button>
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
		<n-modal v-model:show="showDownloadDialog" :mask-closable="false">
			<n-card style="width: 600px" title="下载模型" :bordered="false" size="huge" role="dialog" aria-modal="true">
				<n-space vertical>
					<n-space> <span>下载是否代理：</span><n-switch v-model:value="isProxy"></n-switch></n-space>
					<n-radio-group
						v-model:value="selectedDownloadModel"
						name="radiobuttongroup1"
						:disabled="downloadStatus"
					>
						<n-radio
							v-for="model in modelEmbedOptions"
							:key="model.value"
							:value="model.value"
							:label="model.label"
						/>
					</n-radio-group>
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
					<n-button type="primary" @click="predownloadFile(selectedDownloadModel)" :disabled="downloadStatus">
						下载
					</n-button>
				</n-space>
				<template #footer>
					<n-space justify="end">
						<n-button type="primary" @click="showDownloadDialog = false" :disabled="downloadStatus"
							>关闭</n-button
						>
					</n-space>
				</template>
			</n-card>
		</n-modal>
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
