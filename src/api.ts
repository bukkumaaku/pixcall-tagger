import {
	update_entry,
	create_tag,
	create_tag_response,
	get_selected_entries,
	entry_detail,
	get_entry_path,
	get_all_tags,
	get_all_tags_response,
	get_all_tags_tag,
} from "./api_interface";
import { fetch } from "@tauri-apps/plugin-http";

export async function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
export class PixcallTagger {
	async api(
		data: update_entry | create_tag | get_selected_entries | get_entry_path | get_all_tags | update_entry
	): Promise<
		| create_tag_response
		| entry_detail[]
		| get_selected_entries
		| get_entry_path
		| get_all_tags_response
		| null
		| []
		| string
	> {
		//console.log("开始调用" + data.type);
		const response = await fetch("http://127.0.0.1:22510/request", {
			method: "POST",
			body: JSON.stringify(data),
			headers: { "Content-Type": "application/json" },
		});
		const result = (await response.json()) || null;
		//console.log("结束调用" + JSON.stringify(result));
		return result;
	}
	async get_selected_images(formData: any) {
		const result = (await this.api({ type: "get_selected_entries" })) as entry_detail[];
		const images_id: string[] = [];
		const thumb_hash: string[] = [];
		for (const entry of result || []) {
			if (
				entry.content_type.includes("image") &&
				entry.id &&
				!(formData.overwrite === "nocover" && entry.tags !== null)
			) {
				images_id.push(entry.id); // 同步添加
				thumb_hash.push(entry.content_hash); // 同步添加
			}
		}

		return [images_id, thumb_hash];
	}
	async get_all_tags() {
		const result = (await this.api({ type: "get_all_tags" })) as get_all_tags_response;
		const all_tags_map: { [key: string]: string } = {};
		result.tags.forEach((tag: get_all_tags_tag) => {
			all_tags_map[tag.name] = tag.id.replace("~n", "");
		});
		return all_tags_map;
	}
	async write_nonexist(tags: string[], all_tags_map: { [key: string]: string }) {
		const tag_id: string[] = [];
		for (const tag of tags) {
			if (!all_tags_map[tag]) {
				const add_tag_result = (await this.api({
					type: "create_tag",
					name: tag,
				})) as create_tag_response;
				//wait(10);
				all_tags_map[tag] = add_tag_result.tag.id.replace("~n", "");
			}
			tag_id.push(all_tags_map[tag]);
		}

		return tag_id;
	}
	async write_image_tags(image_id: string, tags: string[]) {
		const post_data = {
			type: "update_entry",
			id: image_id,
			tags: tags.map((tag) => ({ type: "id", value: tag })),
		};
		const result = (await this.api(post_data)) as null | string;
		if (result !== null) {
			alert("Error: " + result);
		}
	}
	async get_file_server() {
		const result: any = await this.api({ type: "get_settings" });
		return result.file_server;
	}
}
