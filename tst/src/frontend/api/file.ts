import { invoke } from "@tauri-apps/api/core";

export async function fileSelect({
	allowedExtensions,
}: {
	allowedExtensions: string[];
}): Promise<string | null> {
	const result = await invoke<string | null>("file_select", {
		allowedExtensions,
	});
	return result;
}

export async function fileLoad(
	path: string,
): Promise<{ content: ArrayBuffer; mimetype: string } | null> {
	const result = await invoke<{
		content: number[];
		mimetype: string;
	} | null>("file_load", { path });
	if (!result) return null;

	return {
		content: new Uint8Array(result.content).buffer,
		mimetype: result.mimetype,
	};
}

export async function fileLoadJSON(path: string): Promise<unknown> {
	const data = await fileLoad(path);
	if (!data) throw new Error(`File not found: ${path}`);

	if (!data.mimetype.includes("json")) {
		throw new Error(`Expected JSON mimetype, got: ${data.mimetype}`);
	}

	return JSON.parse(new TextDecoder().decode(data.content));
}

export async function fileSave(
	path: string,
	content: ArrayBuffer,
): Promise<void> {
	await invoke("file_save", {
		path,
		content: Array.from(new Uint8Array(content)),
	});
}

export async function fileSaveText(
	path: string,
	content: string,
): Promise<void> {
	await fileSave(path, new TextEncoder().encode(content).buffer);
}
