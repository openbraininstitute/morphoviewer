import type { ArrayNumber3 } from "@tolokoban/tgd";
import React from "react";
import { classNames } from "@/utils";
import styles from "./morpho-viewer-octree.module.css";
import { type OctreeManager, useOctreeManager } from "./painter/manager";
import type { MorphoViewerOctreeProps } from "./types";

export function MorphoViewerOctree(props: MorphoViewerOctreeProps) {
	const manager = useOctreeManager(props);

	return (
		<div className={classNames(props.className, styles.morphoViewerOctree)}>
			<Canvas painterManager={manager} />
		</div>
	);
}

const Canvas = React.memo(
	({ painterManager }: { painterManager: OctreeManager }) => {
		return (
			<canvas
				key="canvas"
				ref={(canvas: HTMLCanvasElement | null) => {
					painterManager.canvas = canvas;
					return () => {
						painterManager.canvas = null;
					};
				}}
			/>
		);
	},
);
