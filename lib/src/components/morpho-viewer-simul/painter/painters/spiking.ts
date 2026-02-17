import {
	type TgdContext,
	TgdFilterBlur,
	TgdFilterHueRotation,
	TgdMaterialFlat,
	TgdMaterialFlatTexture,
	type TgdPainter,
	TgdPainterClear,
	TgdPainterFilter,
	TgdPainterFramebuffer,
	TgdPainterFramebufferWithAntiAliasing,
	TgdPainterGroup,
	TgdPainterLogic,
	TgdPainterSegmentsMorphing,
	TgdPainterState,
	TgdTexture2D,
	tgdCanvasCreatePalette,
	webglPresetBlend,
	webglPresetDepth,
} from "@tolokoban/tgd";
import type { MorphoViewerSpikeRecord } from "../../types/public";
import type { MorphologyData } from "../morphology-data";
import { PALETTE } from "./contants";

export class PainterSpiking extends TgdPainterGroup {
	private framebufferOutput: TgdPainterFramebuffer | null = null;
	private textureInternal: TgdTexture2D | null = null;
	private framebufferInternal: TgdPainterFramebufferWithAntiAliasing | null =
		null;
	private readonly palette: TgdTexture2D;
	private painterSegments: TgdPainterSegmentsMorphing | null = null;
	/**
	 * Transition between two views.
	 * For instance, 0.0 for 3D and 1.0 for Dendrogram.
	 */
	private _mix = 0;
	private _spike: MorphoViewerSpikeRecord | undefined = undefined;
	private emptyTexture: TgdTexture2D;

	constructor(
		private readonly context: TgdContext,
		data: MorphologyData,
	) {
		super({ name: "PainterSpiking" });
		this.emptyTexture = new TgdTexture2D(this.context).loadBitmap(
			new ImageData(1, 1),
		);
		this.palette = new TgdTexture2D(context)
			.loadBitmap(tgdCanvasCreatePalette(PALETTE))
			.setParams({
				magFilter: "NEAREST",
				minFilter: "NEAREST",
			});
		this.painterSegments = this.createPainterSegments(context, data);
		this.createFramebufferInternal();
		this.createFramebufferOutput();

		const { framebufferOutput, framebufferInternal } = this;
		if (framebufferInternal && framebufferOutput)
			this.add(framebufferInternal, framebufferOutput);
	}

	get textureOutput(): TgdTexture2D {
		const { framebufferOutput } = this;
		const tex = framebufferOutput?.textureColor0 ?? this.emptyTexture;
		return tex;
	}

	private createFramebufferOutput() {
		const { context, framebufferInternal, painterSegments } = this;
		if (!framebufferInternal)
			throw new Error("framebufferInternal is not defined!");
		if (!painterSegments) throw new Error("painterSegments is not defined!");

		const size = 4;
		const hue = new TgdFilterHueRotation();
		const filters = new TgdPainterFilter(context, {
			filters: [
				new TgdFilterBlur({
					direction: 0,
					size,
				}),
				new TgdFilterBlur({
					direction: 90,
					size,
				}),
				// hue,
			],
			texture: framebufferInternal.textureColor0,
			flipY: true,
		});
		const textureOutput = new TgdTexture2D(context).setParams({
			magFilter: "LINEAR",
			minFilter: "LINEAR",
		});
		this.framebufferOutput = new TgdPainterFramebuffer(context, {
			children: [
				new TgdPainterState(context, {
					depth: webglPresetDepth.off,
					blend: webglPresetBlend.off,
					children: [
						new TgdPainterClear(context, { color: [0, 0, 0, 0] }),
						filters,
					],
				}),
				new TgdPainterLogic((time) => {
					hue.hueShiftInDegrees = time * 90;
				}),
			],
			depthBuffer: false,
			viewportMatchingScale: 0.25,
			textureColor0: textureOutput,
		});
	}

	private createFramebufferInternal() {
		const { context, painterSegments } = this;
		if (!painterSegments) throw new Error("painterSegments is not defined!");

		const textureInternal = (this.textureInternal = new TgdTexture2D(
			context,
		).setParams({
			magFilter: "LINEAR",
			minFilter: "LINEAR",
		}));
		this.framebufferInternal = new TgdPainterFramebufferWithAntiAliasing(
			context,
			{
				children: [
					new TgdPainterClear(context, { color: [0, 0, 0, 1], depth: 1 }),
					new TgdPainterState(context, {
						depth: webglPresetDepth.less,
						blend: webglPresetBlend.off,
						children: [painterSegments],
					}),
				],
				depthBuffer: true,
				viewportMatchingScale: 0.25,
				textureColor0: textureInternal,
			},
		);
	}

	private createPainterSegments(context: TgdContext, data: MorphologyData) {
		const { dataset3D, datasetDendrogram } = data;
		const painterSegments = (this.painterSegments =
			new TgdPainterSegmentsMorphing(context, {
				roundness: 4,
				minRadius: 1,
				radiusMultiplier: 1.2,
				datasetsPairs: [[dataset3D, datasetDendrogram]],
				material: new TgdMaterialFlat({
					color: [0.9, 0.6, 0.3, 1],
				}),
			}));
		painterSegments.mix = this.mix;
		return painterSegments;
	}

	get spike() {
		return this._spike;
	}
	set spike(value: MorphoViewerSpikeRecord | undefined) {
		this._spike = value;
		this.context.paint();
	}

	get mix() {
		return this._mix;
	}

	set mix(mix: number) {
		this._mix = mix;
		if (this.painterSegments) {
			this.painterSegments.mix = mix;
		}
	}

	// paint(time: number, delay: number): void {
	// 	super.paint(time, delay);
	// 	this.context.camera.debug();
	// }

	delete() {
		this.palette.delete();
		this.textureOutput.delete();
		this.painterSegments?.delete();
		this.textureInternal?.delete();
		this.framebufferOutput?.delete();
		this.framebufferInternal?.delete();
	}
}
