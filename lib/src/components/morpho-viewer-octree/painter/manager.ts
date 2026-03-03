import {
	type ArrayNumber3,
	TgdContext,
	TgdControllerCameraOrbit,
	TgdDataGlb,
	TgdGeometryBox,
	type TgdMaterial,
	TgdMaterialDiffuse,
	TgdMaterialFaceOrientation,
	TgdPainterClear,
	TgdPainterGroup,
	TgdPainterLOD,
	TgdPainterMesh,
	TgdPainterMeshGltf,
	TgdPainterState,
	TgdVec3,
	webglPresetCull,
	webglPresetDepth,
} from "@tolokoban/tgd";
import React from "react";
import { morphoViewerOctreeBlockToId } from "../tools";
import type { MorphoViewerOctreeProps } from "../types";
import { makeCamera } from "./camera";

export class OctreeManager {
	public loadInfo: MorphoViewerOctreeProps["loadInfo"] | null = null;
	public loadBlock: MorphoViewerOctreeProps["loadBlock"] | null = null;

	private _meshId: string = "";
	private _canvas: HTMLCanvasElement | null = null;
	private context: TgdContext | null = null;
	private readonly group = new TgdPainterGroup({ name: "Group" });
	private promisedInfo: ReturnType<MorphoViewerOctreeProps["loadInfo"]> | null =
		null;
	private readonly availableBlocks = new Set<string>();
	private readonly material = new TgdMaterialFaceOrientation();
	// new TgdMaterialDiffuse({
	// 	lockLightsToCamera: true,
	// 	color: [1, 0.667, 0.1, 1],
	// });
	private orbit: TgdControllerCameraOrbit | null = null;

	get meshId() {
		return this._meshId;
	}
	set meshId(meshId: string) {
		if (this._meshId === meshId) return;

		this._meshId = meshId;
		this.promisedInfo = null;
		this.resetMeshLoading();
	}

	get canvas(): HTMLCanvasElement | null {
		return this._canvas;
	}
	set canvas(canvas: HTMLCanvasElement | null) {
		if (this._canvas === canvas) return;

		this._canvas = canvas;
		this.context?.delete();
		this.orbit?.detach();
		if (!canvas) return;

		const context = (this.context = new TgdContext(canvas, {
			antialias: true,
			alpha: false,
			depth: true,
		}));
		context.add(
			new TgdPainterClear(context, {
				color: [0, 0, 0, 1],
				depth: 1,
			}),
			new TgdPainterState(context, {
				depth: webglPresetDepth.less,
				cull: webglPresetCull.off,
				children: [this.group],
			}),
		);
		this.group.removeAll();
		this.resetMeshLoading();
	}

	private readonly resetMeshLoading = async () => {
		const { loadInfo } = this;
		if (!loadInfo) return;

		const { group } = this;
		const promisedInfo = this.promisedInfo ?? loadInfo(this.meshId);
		this.promisedInfo = promisedInfo;
		const { context } = this;
		if (!context) return;

		const info = await promisedInfo;
		if (!info) return;

		const camera = makeCamera(info.bbox);
		context.camera = camera;
		this.orbit?.detach();
		this.orbit = new TgdControllerCameraOrbit(context, {
			inertiaOrbit: 1000,
		});
		this.availableBlocks.clear();
		for (const blockId of info.blockIds) {
			this.availableBlocks.add(blockId);
		}
		const lod = new TgdPainterLOD(context, {
			bbox: info.bbox,
			subdivisions: 4,
			surfaceThreshold: 1,
			factory: async (x: number, y: number, z: number, level: number) => {
				const { loadBlock, context } = this;
				if (!loadBlock || !context) return null;

				const blockId = morphoViewerOctreeBlockToId(x, y, z, level);
				if (!this.availableBlocks.has(blockId)) {
					console.log("Not found!");
					return null;
				}

				const block = await loadBlock(this.meshId, blockId);
				if (block?.type === "glb") {
					const asset = await TgdDataGlb.parse(block.data);
					const mesh = new TgdPainterMeshGltf(context, {
						asset,
						material: this.material,
					});
					const bbox = mesh.computeBoundingBox();
					console.log("🐞 [manager@130] bbox =", bbox); // @FIXME: Remove this line written on 2026-03-03 at 11:13
					return mesh;
				}
				return null;
			},
		});
		group.removeAll();
		group.add(lod);
		// group.add(makeDebugMesh(context, info.bbox, this.material));
		context.paint();
	};
}

type BBox = { min: ArrayNumber3; max: ArrayNumber3 };

function makeDebugMesh(context: TgdContext, bbox: BBox, material: TgdMaterial) {
	const vecMin = new TgdVec3(bbox.min);
	const vecMax = new TgdVec3(bbox.max);
	const vecDim = new TgdVec3(vecMax).subtract(vecMin);
	const center = new TgdVec3(vecMax).add(vecMin).scale(0.5);
	return new TgdPainterMesh(context, {
		geometry: new TgdGeometryBox({
			center,
			sizeX: vecDim.x,
			sizeY: vecDim.y,
			sizeZ: vecDim.z,
		}),
		material,
	});
}

export function useOctreeManager({
	meshId,
	loadInfo,
	loadBlock,
}: MorphoViewerOctreeProps): OctreeManager {
	const ref = React.useRef<OctreeManager | null>(null);
	if (!ref.current) ref.current = new OctreeManager();
	React.useEffect(() => {
		const manager = ref.current;
		if (!manager) return;

		manager.loadInfo = loadInfo;
		manager.loadBlock = loadBlock;
		manager.meshId = meshId;
	}, [meshId, loadInfo, loadBlock]);
	return ref.current;
}
