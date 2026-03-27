import type { ArrayNumber3 } from "@tolokoban/tgd";

export type MorphoViewerOctreeMeshType = {
	type: "glb";
	data: ArrayBuffer;
};

export interface MorphoViewerOctreeInfo {
	bbox: {
		min: ArrayNumber3;
		max: ArrayNumber3;
	};
	blockIds: string[];
}

export interface MorphoViewerOctreeProps {
	className?: string;
	meshId: string;
	loadInfo(meshId: string): Promise<MorphoViewerOctreeInfo | null>;
	/**
	 *
	 * @param blockId Indentifier of a block, composed only of "0" and "1" chars.
	 */
	loadBlock(
		meshId: string,
		blockId: string,
	): Promise<MorphoViewerOctreeMeshType | null>;
}
