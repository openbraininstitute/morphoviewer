import {
	type ArrayNumber3,
	TgdContext,
	TgdDataGlb,
	TgdPainterClear,
	TgdPainterGroup,
	TgdPainterLOD,
	TgdPainterMeshGltf,
	TgdPainterState,
	webglPresetDepth,
} from "@tolokoban/tgd";
import React from "react";
import type { MorphoViewerOctreeProps } from "../types";
import { makeCamera } from "./camera";

export class OctreeManager {
	public loadInfo: MorphoViewerOctreeProps["loadInfo"] | null = null;
	public loadBlock: MorphoViewerOctreeProps["loadBlock"] | null = null;

	private _meshId: string = "";
	private _canvas: HTMLCanvasElement | null = null;
	private context: TgdContext | null = null;
	private readonly group = new TgdPainterGroup();
	private promisedInfo: ReturnType<MorphoViewerOctreeProps["loadInfo"]> | null =
		null;
	private readonly availableBlocks = new Set<string>();

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
		group.removeAll();
		const promisedInfo = this.promisedInfo ?? loadInfo(this.meshId);
		this.promisedInfo = promisedInfo;
		const { context } = this;
		if (!context) return;

		const info = await promisedInfo;
		if (!info) return;

		const camera = makeCamera(info.bbox);
		context.camera = camera;
		const lod = new TgdPainterLOD(context, {
			bbox: info.bbox,
			subdivisions: 4,
			factory: async (x: number, y: number, z: number, level: number) => {
				const { loadBlock, context } = this;
				if (!loadBlock || !context) return null;

				const blockId = `${toBin(x, level)}${toBin(y, level)}${toBin(z, level)}`;
				if (!this.availableBlocks.has(blockId)) return null;

				const block = await loadBlock(this.meshId, blockId);
				if (block?.type === "glb") {
					const asset = await TgdDataGlb.parse(block.data);
					const mesh = new TgdPainterMeshGltf(context, {
						asset,
					});
					return mesh;
				}
				return null;
			},
		});
		group.add(lod);
		context.paint();
	};
}

function toBin(value: number, level: number): string {
	return value.toString(2).padStart(level, "0");
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
