<script setup lang="ts">
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { PixcallTagger } from "./api";
import { BaseDirectory, open as openFile } from "@tauri-apps/plugin-fs";

// @ts-ignore
import {
	lightTheme,
	NConfigProvider,
	NDivider,
	NForm,
	NFormItem,
	NInput,
	NSelect,
	NButton,
	NMessageProvider,
} from "naive-ui";

const api = new PixcallTagger();

const message = {
	error: (e: any) => {
		console.error(e);
		alert(e);
	},
	info: (msg: string) => {
		console.info(msg);
	},
	success: (msg: string) => {
		console.log(msg);
	},
};

// 表单数据
const formData = ref({
	repoPath: "",
	folderId: "",
	tagPath: "",
	modelPath: "",
});

// 文件夹选项
const folderOptions = ref<{ label: string; value: string }[]>([]);

// 选择资源库路径
async function selectRepoPath() {
	const selected = await open({
		directory: true,
		multiple: false,
		title: "选择Pixcall资源库位置",
	});

	if (Array.isArray(selected) || selected === null) return;

	formData.value.repoPath = selected as string;

	// 验证资源库
	const isValid = await invoke("check_repo", { repoPath: formData.value.repoPath });
	if (!isValid) {
		message.error("选择的路径不是有效的Pixcall资源库");
		return;
	}

	// 获取文件夹列表
	try {
		const folders = await invoke<[string, string][]>("get_folders", { repoPath: formData.value.repoPath });
		folderOptions.value = folders.map(([id, name]) => ({
			label: name,
			value: id,
		}));
	} catch (error) {
		message.error("获取文件夹列表失败: " + error);
	}
}

// 选择标签集路径
async function selectTagPath() {
	const selected = await open({
		filters: [{ name: "CSV Files", extensions: ["csv"] }],
		multiple: false,
		title: "选择标签集文件",
	});

	if (Array.isArray(selected) || selected === null) return;
	formData.value.tagPath = selected as string;
}

// 选择模型路径
async function selectModelPath() {
	const selected = await open({
		filters: [{ name: "ONNX Models", extensions: ["onnx"] }],
		multiple: false,
		title: "选择模型文件",
	});

	if (Array.isArray(selected) || selected === null) return;
	formData.value.modelPath = selected as string;
}

// 执行打标
async function tagImages() {
	/* if (!formData.value.repoPath) {
		message.error("请先选择资源库位置");
		return;
	}

	if (!formData.value.folderId) {
		message.error("请选择要打标的文件夹");
		return;
	} */

	/* if (!formData.value.tagPath) {
		message.error("请选择标签集文件");
		return;
	}

	if (!formData.value.modelPath) {
		message.error("请选择模型文件");
		return;
	} */

	try {
		message.info("开始打标，请稍候...");
		const [image_id, thumb_hash] = await api.get_selected_images();
		const all_tags_map = await api.get_all_tags();
		const tags = (await invoke("tag_images", {
			thumbHash: thumb_hash,
			tagPath: "E:\\KANKAN\\tools\\eagle_tagger\\tagger\\models\\wd-eva02-large-tagger-v3\\selected_tags.csv",
			modelPath: "E:\\KANKAN\\tools\\eagle_tagger\\tagger\\models\\wd-eva02-large-tagger-v3\\model.onnx",
		})) as string[][];
		for (let i = 0; i < thumb_hash.length; i++) {
			const tag_id = await api.write_nonexist(tags[i], all_tags_map);
			await api.write_image_tags(image_id[i], tag_id);
		}
		message.success("打标完成！");
	} catch (error) {
		message.error("打标失败: " + error);
	}
}

async function downloadFilePureFrontend(url: string, fileName: string) {
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
				const percent = Math.round((receivedBytes / totalBytes) * 100);
				console.log(`下载进度: ${percent}%`);
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
</script>

<template>
	<n-config-provider :theme="lightTheme">
		<n-message-provider>
			<n-divider style="position: fixed; top: 5px; left: 0px; width: 100%"></n-divider>
			<n-form
				:model="formData"
				label-placement="left"
				label-width="auto"
				style="width: fit-content; margin: auto auto; position: relative; margin-top: 30px"
			>
				<n-form-item label="资源库位置" path="repoPath">
					<n-input v-model:value="formData.repoPath" placeholder="请选择资源库位置" readonly />
					<n-button @click="selectRepoPath" style="margin-left: 10px">选择</n-button>
				</n-form-item>

				<n-form-item label="文件夹" path="folderId">
					<n-select
						v-model:value="formData.folderId"
						:options="folderOptions"
						placeholder="请选择要打标的文件夹"
						:disabled="!folderOptions.length"
					/>
				</n-form-item>

				<n-form-item label="标签集路径" path="tagPath">
					<n-input v-model:value="formData.tagPath" placeholder="请选择标签集文件" readonly />
					<n-button @click="selectTagPath" style="margin-left: 10px">选择</n-button>
				</n-form-item>

				<n-form-item label="模型路径" path="modelPath">
					<n-input v-model:value="formData.modelPath" placeholder="请选择模型文件" readonly />
					<n-button @click="selectModelPath" style="margin-left: 10px">选择</n-button>
				</n-form-item>

				<div style="display: flex; gap: 10px; justify-content: flex-end">
					<n-button type="primary" @click="tagImages">开始打标</n-button>
				</div>
			</n-form>
		</n-message-provider>
	</n-config-provider>
</template>

<style scoped>
.logo.vite:hover {
	filter: drop-shadow(0 0 2em #747bff);
}

.logo.vue:hover {
	filter: drop-shadow(0 0 2em #249b73);
}
</style>
