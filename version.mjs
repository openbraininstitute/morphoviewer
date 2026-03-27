import FS from "node:fs/promises";

/**
 * @param {string} path
 * @returns {Promise<Record<string, unknown>>}
 */
async function loadJSON(path) {
	const data = await FS.readFile(path);
	const text = data.toString();
	return JSON.parse(text);
}

/**
 * @param {string} path
 * @param {unknown} data
 */
async function saveJSON(path, data) {
	await FS.writeFile(path, JSON.stringify(data, null, 4));
}

async function start() {
	const { version } = await loadJSON("./package.json");
	const title = `Version: ${version}`;
	console.log(`+${"-".repeat(title.length + 2)}+`);
	console.log(`| ${title} |`);
	console.log(`+${"-".repeat(title.length + 2)}+`);
	const lib = await loadJSON("./lib/package.json");
	lib.version = version;
	await saveJSON("./lib/package.json", lib);
	await saveJSON("./lib/src/package.json", lib);
	const doc = await loadJSON("./doc/package.json");
	doc.version = version;
	await saveJSON("./doc/package.json", doc);
}

start();
