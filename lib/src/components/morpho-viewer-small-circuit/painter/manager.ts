import {
	TgdBoundingBox,
	TgdCameraPerspective,
	TgdColor,
	TgdContext,
	TgdControllerCameraOrbit,
	TgdEvent,
	TgdPainterClear,
	TgdPainterGroup,
	TgdPainterState,
	webglPresetDepth,
} from "@tolokoban/tgd";
import React from "react";
import type {
	MorphoViewerSmallCircuitCell,
	MorphoViewerSmallCircuitCellData,
	MorphoViewerSmallCircuitProps,
} from "..";
import { CameraManager } from "./camera";
import { PainterCell } from "./painter-cell/painter-cell";

export class PainterManager {
	public readonly eventRestingPosition = new TgdEvent<boolean>();
	private _canvas: HTMLCanvasElement | null = null;
	private _background = "#000";
	private readonly backgroundColor = new TgdColor(0, 0, 0, 1);
	private context: TgdContext | null = null;
	private cameraManager: CameraManager | null = null;
	private painterClear: TgdPainterClear | null = null;
	private readonly groupCells = new TgdPainterGroup({ name: "GroupCell" });
	private circuit: MorphoViewerSmallCircuitCell[] = [];
	private loadCell:
		| null
		| ((id: string) => Promise<MorphoViewerSmallCircuitCellData | null>) = null;

	readonly resetCamera = () => this.cameraManager?.resetCamera();

	setCircuit(
		circuit: MorphoViewerSmallCircuitCell[],
		loadCell: (id: string) => Promise<MorphoViewerSmallCircuitCellData | null>,
	) {
		this.circuit = circuit;
		this.loadCell = loadCell;
		this.updateCircuit();
	}

	private updateCircuit() {
		const { context } = this;
		if (!context) return;

		const { loadCell } = this;
		if (!loadCell) return;

		const camera = new TgdCameraPerspective({
			zoom: 1,
		});
		const bbox = new TgdBoundingBox();
		for (const cell of this.circuit) {
			const [x, y, z] = cell.center;
			bbox.addSphere(x, y, z, cell.somaRadius * 2);
			const painterCell = new PainterCell(context, { cell, loadCell });
			this.groupCells.add(painterCell);
		}
		const bboxW = Math.abs(bbox.max[0] - bbox.min[0]);
		const bboxH = Math.abs(bbox.max[1] - bbox.min[1]);
		camera.transfo.position = bbox.center;
		const scale = 2;
		camera.fitSpaceAtTarget(bboxW * scale, bboxH * scale);
		camera.near = 1;
		camera.far = camera.transfo.distance * 2;
		camera.zoom = 1;
		const { cameraManager } = this;
		if (cameraManager) {
			cameraManager.target = camera.getCurrentState();
		}
		context.paint();
		context.camera = camera;
	}

	get background() {
		return this._background;
	}
	set background(color: string) {
		this._background = color;
		this.backgroundColor.parse(color);
		const clear = this.painterClear;
		if (clear) {
			clear.red = this.backgroundColor.R;
			clear.green = this.backgroundColor.G;
			clear.blue = this.backgroundColor.B;
			clear.alpha = this.backgroundColor.A;
		}
	}

	get canvas() {
		return this._canvas;
	}
	set canvas(canvas: HTMLCanvasElement | null) {
		if (this._canvas === canvas) return;

		if (this.context) {
			this.delete();
		}
		this._canvas = canvas;
		if (!canvas) return;

		const context = new TgdContext(canvas);
		this.context = context;
		this.cameraManager = new CameraManager(context, this.eventRestingPosition);
		const clear = (this.painterClear = new TgdPainterClear(context, {
			color: [
				this.backgroundColor.R,
				this.backgroundColor.G,
				this.backgroundColor.B,
				this.backgroundColor.A,
			],
			depth: 1,
		}));
		context.add(
			clear,
			new TgdPainterState(context, {
				depth: webglPresetDepth.less,
				children: [this.groupCells],
			}),
		);
		this.updateCircuit();
	}

	private delete() {
		this.cameraManager?.delete();
		this.cameraManager = null;
		this.groupCells.removeAll();
		this.painterClear?.delete();
		this.painterClear = null;
		this.context?.delete();
		this.context = null;
	}
}

export function usePainterManager({
	backgroundColor,
	circuit,
	loadCell,
}: MorphoViewerSmallCircuitProps) {
	const ref = React.useRef<PainterManager | null>(null);
	if (!ref.current) {
		ref.current = new PainterManager();
	}
	const manager = ref.current;
	React.useEffect(() => {
		manager.background = backgroundColor ?? "#000";
	}, [backgroundColor]);
	React.useEffect(() => {
		manager.setCircuit(circuit, loadCell);
	}, [circuit, loadCell]);
	return ref.current;
}
