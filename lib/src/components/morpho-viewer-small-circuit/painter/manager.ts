import {
	TgdBoundingBox,
	TgdCameraPerspective,
	TgdColor,
	TgdContext,
	TgdEvent,
	TgdFilterBlur,
	type TgdInputPointerEventMove,
	type TgdPainter,
	TgdPainterClear,
	TgdPainterFilter,
	TgdPainterFramebufferWithAntiAliasing,
	TgdPainterGroup,
	TgdPainterMix,
	TgdPainterState,
	TgdTexture2D,
	webglPresetBlend,
	webglPresetDepth,
} from "@tolokoban/tgd";
import React from "react";
import type {
	MorphoViewerSmallCircuitCell,
	MorphoViewerSmallCircuitCellData,
	MorphoViewerSmallCircuitProps,
} from "..";
import { CameraManager } from "./camera";
import { OffscreenPainter } from "./offscreen-painter";
import { PainterCell } from "./painter-cell/painter-cell";

interface Framebuffer {
	textureColor0?: TgdTexture2D;
	delete(): void;
}
export class PainterManager {
	public readonly eventRestingPosition = new TgdEvent<boolean>();
	public readonly eventCellHover = new TgdEvent<
		MorphoViewerSmallCircuitCell | undefined
	>();

	/**
	 * Used for the highlights, because we don't want to render at full resolution
	 * something that will be blurry anyway,
	 */
	private readonly viewportMatchingScale = 0.25;
	private _canvas: HTMLCanvasElement | null = null;
	private _background = "#000";
	private readonly backgroundColor = new TgdColor(0, 0, 0, 1);
	private context: TgdContext | null = null;
	private cameraManager: CameraManager | null = null;
	private painterClear: TgdPainterClear | null = null;
	private offscreen: OffscreenPainter | null = null;
	private _highlightedCellIds: string[] = [];
	private hoveredCellId: string | undefined = "";
	private readonly groupCells = new TgdPainterGroup({ name: "GroupCell" });
	private circuit: MorphoViewerSmallCircuitCell[] = [];
	private readonly highlightingCells = new Map<string, PainterCell>();
	private readonly groupHighlithedCells = new TgdPainterGroup({
		name: "groupHighlisthedCells",
	});
	private loadCell:
		| null
		| ((id: string) => Promise<MorphoViewerSmallCircuitCellData | null>) = null;
	private framebufferCircuit: Framebuffer | null = null;
	private textureFramebufferCircuit: TgdTexture2D | null = null;
	private framebufferHighlightedCells: Framebuffer | null = null;
	private textureFramebufferHighlightedCells: TgdTexture2D | null = null;
	private framebufferBlur: Framebuffer | null = null;
	private textureFramebufferBlur: TgdTexture2D | null = null;

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
		this.offscreen = new OffscreenPainter(context, {
			circuit: this.circuit,
			loadCell,
		});
		const bbox = new TgdBoundingBox();
		const { highlightingCells } = this;
		highlightingCells.clear();
		this.groupHighlithedCells.removeAll();
		for (const cell of this.circuit) {
			const [x, y, z] = cell.center;
			bbox.addSphere(x, y, z, cell.somaRadius * 2);
			const painterCell = new PainterCell(context, {
				cell,
				loadCell,
				matrerial: "full",
			});
			this.groupCells.add(painterCell);
			const highlightedCell = new PainterCell(context, {
				cell,
				loadCell,
				matrerial: "flat",
			});
			this.groupHighlithedCells.add(highlightedCell);
			highlightingCells.set(cell.id, highlightedCell);
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
		this.updateHightedCells();
		context.paint();
		context.camera = camera;
	}

	public get highlightedCellIds() {
		return this._highlightedCellIds;
	}
	public set highlightedCellIds(value: string[]) {
		if (value === this._highlightedCellIds) return;

		this._highlightedCellIds = value;
		this.updateHightedCells();
	}

	private updateHightedCells() {
		const {
			highlightingCells,
			groupHighlithedCells,
			circuit,
			highlightedCellIds,
		} = this;
		groupHighlithedCells.removeWithoutDeleting();
		for (const cell of circuit) {
			const painter = highlightingCells.get(cell.id);
			if (painter) {
				painter.black = true;
				groupHighlithedCells.add(painter);
			}
		}
		for (const id of highlightedCellIds) {
			const painter = highlightingCells.get(id);
			if (painter) {
				painter.black = false;
			}
		}
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
		context.inputs.pointer.eventHover.addListener(this.handlePointerHover);
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
			this.createramebufferCircuit(context, clear),
			this.createFramebufferHighlightedCells(context),
			this.createFramebufferBlur(context),
			this.createMix(context),
		);
		this.updateCircuit();
	}

	private createramebufferCircuit(context: TgdContext, clear: TgdPainterClear) {
		this.textureFramebufferCircuit = new TgdTexture2D(context);
		this.framebufferCircuit = new TgdPainterFramebufferWithAntiAliasing(
			context,
			{
				textureColor0: this.textureFramebufferCircuit,
				depthBuffer: true,
				children: [
					clear,
					new TgdPainterState(context, {
						depth: webglPresetDepth.less,
						children: [this.groupCells],
					}),
				],
			},
		);
		return this.framebufferCircuit as TgdPainter;
	}

	private createFramebufferHighlightedCells(context: TgdContext) {
		const { viewportMatchingScale } = this;
		this.textureFramebufferHighlightedCells = new TgdTexture2D(context);
		this.framebufferHighlightedCells =
			new TgdPainterFramebufferWithAntiAliasing(context, {
				viewportMatchingScale,
				textureColor0: this.textureFramebufferHighlightedCells,
				depthBuffer: true,
				children: [
					new TgdPainterClear(context, { depth: 1, color: [0, 0, 0, 1] }),
					new TgdPainterState(context, {
						depth: webglPresetDepth.less,
						children: [this.groupHighlithedCells],
					}),
				],
			});
		return this.framebufferHighlightedCells as TgdPainter;
	}

	private createFramebufferBlur(context: TgdContext) {
		const { textureFramebufferHighlightedCells } = this;
		if (!textureFramebufferHighlightedCells)
			throw new Error(
				"You must call createFramebufferHighlightedCells() before this createFramebufferBlur()!",
			);

		const { viewportMatchingScale } = this;
		const size = 3;
		this.textureFramebufferBlur = new TgdTexture2D(context);
		this.framebufferBlur = new TgdPainterFramebufferWithAntiAliasing(context, {
			viewportMatchingScale,
			textureColor0: this.textureFramebufferBlur,
			children: [
				new TgdPainterClear(context, { color: [0, 0, 0, 1] }),
				new TgdPainterState(context, {
					depth: webglPresetDepth.off,
					children: [
						new TgdPainterFilter(context, {
							flipY: true,
							texture: textureFramebufferHighlightedCells,
							filters: [
								new TgdFilterBlur({
									size,
									direction: 0,
								}),
								new TgdFilterBlur({
									size,
									direction: 90,
								}),
							],
						}),
					],
				}),
			],
		});
		return this.framebufferBlur as TgdPainter;
	}

	private createMix(context: TgdContext) {
		const { framebufferCircuit, framebufferBlur } = this;
		if (!framebufferCircuit)
			throw new Error(
				"Framebuffer for circuit must be created before calling createMix()!",
			);
		if (!framebufferBlur)
			throw new Error(
				"Framebuffer for blur must be created before calling createMix()!",
			);

		return new TgdPainterState(context, {
			depth: webglPresetDepth.off,
			blend: webglPresetBlend.off,
			children: [
				new TgdPainterMix(context, {
					texture1: framebufferCircuit.textureColor0,
					texture2: framebufferBlur.textureColor0,
					strength: 1,
				}),
			],
		});
	}

	private readonly handlePointerHover = (evt: TgdInputPointerEventMove) => {
		const { offscreen } = this;
		if (!offscreen) return;

		const cell = offscreen.getItemAt(evt.current.x, evt.current.y);
		if (cell?.id === this.hoveredCellId) return;

		this.hoveredCellId = cell?.id;
		this.eventCellHover.dispatch(cell);
	};

	private delete() {
		this.textureFramebufferCircuit?.delete();
		this.textureFramebufferCircuit = null;
		this.framebufferCircuit?.delete();
		this.framebufferCircuit = null;
		this.framebufferBlur?.delete();
		this.framebufferBlur = null;
		this.framebufferHighlightedCells?.delete();
		this.framebufferHighlightedCells = null;
		this.offscreen?.delete();
		this.offscreen = null;
		this.cameraManager?.delete();
		this.cameraManager = null;
		this.groupCells.removeAll();
		this.painterClear?.delete();
		this.painterClear = null;
		if (this.context) {
			this.context.inputs.pointer.eventHover.removeListener(
				this.handlePointerHover,
			);
			this.context.delete();
			this.context = null;
		}
	}
}

export function usePainterManager({
	backgroundColor,
	circuit,
	loadCell,
	onCellHover,
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
	React.useEffect(() => {
		if (!onCellHover) return;

		manager.eventCellHover.addListener(onCellHover);
		return () => {
			manager.eventCellHover.removeListener(onCellHover);
		};
	}, [onCellHover]);
	return ref.current;
}
