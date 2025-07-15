interface update_entry_tag {
	type: string;
	value: string;
}

export interface update_entry {
	/* {
    "type":"update_entry",
    "id":"469693976858829824",
    "tags":[{
        "type":"id",
        "id":"479146563953730560",
        "value":""
    }]
} */
	type: string;
	id: string;
	tags: update_entry_tag[];
}

export interface create_tag {
	/* {
    "type":"create_tag",
    "name":"okk"
} */
	type: string;
	name: string;
}

export interface create_tag_response {
	/* {
	"message": "created",
	"tag": {
		"category": "O",
		"group_id": null,
		"id": "~n479372042392544256",
		"name": "okk",
		"pinyin": "",
		"revision": 1
	}
} */
	message: string;
	tag: {
		category: string;
		group_id: string | null;
		id: string;
		name: string;
		pinyin: string;
		revision: number;
	};
}

export interface get_selected_entries {
	type: string;
}
export interface entry_detail {
	/* {
		"content_hash": "4867acc6692074155cbc7d8f4058135e1591162c747315cefdf0097f855ac89a",
		"content_type": "image/png",
		"created_at": "2025-05-30T13:47:21.578Z",
		"description": null,
		"id": "469693976858829824",
		"inode": "562949953631162",
		"is_deleted": false,
		"is_hidden": 0,
		"kind": 1,
		"link": null,
		"metadata": {
			"color_palette": "3957249929,4072507955,2931016468,2927854607,4006061581,2052414727,2927385606,3450644229",
			"creation": "2025-05-30T12:06:56.649Z",
			"custom_thumb": false,
			"has_thumb": true,
			"image_height": 273,
			"image_width": 270,
			"modification": "2025-05-30T12:06:56.649Z",
			"thumb_hash": "d82263334811611b00235520275fbd8a2582989c86e986f423e6fb07a40c74d5",
			"thumb_height": 273,
			"thumb_width": 270
		},
		"mtime": "1748606816649",
		"name": "27ff1147-756c-4f03-9a2b-9cc31746110c.png",
		"name_pinyin": null,
		"parent_id": "1",
		"ranking": "9000000000000000000",
		"rating": null,
		"revision": 13,
		"size": 98442,
		"source_path": null,
		"status": 2069,
		"tags": "479146563953730560|479147112761631744",
		"updated_at": "2025-06-26T02:10:47.294Z"
	} */
	content_hash: string;
	content_type: string;
	created_at: string;
	description: string | null;
	id: string;
	inode: string;
	is_deleted: boolean;
	is_hidden: number;
	kind: number;
	link: string | null;
	metadata: {
		color_palette: string;
		creation: string;
		custom_thumb: boolean;
		has_thumb: boolean;
		image_height: number;
		image_width: number;
		modification: string;
		thumb_hash: string;
		thumb_height: number;
		thumb_width: number;
	};
	mtime: string;
	name: string;
	name_pinyin: string | null;
	parent_id: string;
	ranking: string;
	rating: string | null;
	revision: number;
	size: number;
	source_path: string | null;
	status: number;
	tags: string;
	updated_at: string;
}

export interface get_entry_path {
	type: string;
	id: string;
}

export interface get_all_tags {
	type: string;
}

export interface get_all_tags_tag {
	category: string;
	group_id: string | null;
	id: string;
	name: string;
	pinyin: string;
	revision: number;
}
export interface get_all_tags_response {
	tags: get_all_tags_tag[];
}

export interface get_settings {
	type: string;
}
