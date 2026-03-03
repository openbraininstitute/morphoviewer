import { MorphoViewerOctree } from "@bbp/morphoviewer";
import { assertType } from "@tolokoban/type-guards";
import { ViewLabel, ViewOptions } from "@tolokoban/ui";
import React from "react";
import Styles from "./page.module.css";

export default function PageMorphoViewerOctree() {
	const [meshId, setMeshId] = React.useState("1");

	return (
		<div className={Styles.morphoViewerOctree}>
			<header>
				<ViewLabel>Choose the mesh:</ViewLabel>
				<ViewOptions value={meshId} onChange={setMeshId}>
					<div key="1">Example #1</div>
					<div key="2">Example #2</div>
				</ViewOptions>
			</header>
			<MorphoViewerOctree
				className={Styles.octree}
				meshId={meshId}
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
					console.log("🐞 [page@39] data.bbox =", data.bbox); // @FIXME: Remove this line written on 2026-03-03 at 11:56
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
