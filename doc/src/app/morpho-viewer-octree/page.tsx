import { MorphoViewerOctree } from "@bbp/morphoviewer";
import { assertType } from "@tolokoban/type-guards";
import Styles from "./page.module.css";

export default function PageMorphoViewerOctree() {
	return (
		<div className={Styles.morphoViewerOctree}>
			<MorphoViewerOctree
				className={Styles.octree}
				meshId="1"
				loadInfo={async (meshId: string) => {
					const url = `./assets/octree/${meshId}/info.json`;
					console.debug("Loading info:", url);
					const resp = await fetch(url);
					if (!resp.ok) {
						throw new Error(
							`Unable to get info file: ${url}!\nError #${resp.status}: ${resp.statusText}`,
						);
					}
					const data = await resp.json();
					assertType(data, {
						bbox: {
							min: ["array", "number"],
							max: ["array", "number"],
						},
						files: "string",
					});
					return {
						bbox: data.bbox as BBox,
						blockIds: data.files.split(","),
					};
				}}
				loadBlock={async (meshId: string, blockId: string) => {
					const url = `./assets/octree/${meshId}/${blockId}.glb`;
					console.debug("Loading:", url);
					const resp = await fetch(url);
					if (!resp.ok) {
						console.error(
							`Unable to get info file: ${url}!\nError #${resp.status}: ${resp.statusText}`,
						);
						return null;
					}
					return {
						type: "glb",
						data: await resp.arrayBuffer(),
					};
				}}
			/>
		</div>
	);
}

interface BBox {
	min: [number, number, number];
	max: [number, number, number];
}
