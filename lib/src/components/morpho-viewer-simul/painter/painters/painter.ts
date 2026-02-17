import {
	type TgdContext,
	TgdLight,
	TgdMaterialDiffuse,
	TgdPainter,
	TgdPainterClear,
	TgdPainterFilter,
	TgdPainterFramebuffer,
	TgdPainterFramebufferWithAntiAliasing,
	TgdPainterGroup,
	TgdPainterLogic,
	TgdPainterMix,
	type TgdPainterSegmentsData,
	TgdPainterSegmentsMorphing,
	TgdPainterState,
	TgdTexture2D,
	TgdVec3,
	tgdCalcMapRange,
	tgdCalcModulo,
	tgdCanvasCreatePalette,
	webglPresetBlend,
	webglPresetDepth,
} from "@tolokoban/tgd";
import type { MorphoViewerSpikeRecord } from "../../types/public";
import type { MorphologyData } from "../morphology-data";
import { PALETTE } from "./contants";
import { PainterHover as PainterHighlight } from "./highlight";
import { PainterSpiking } from "./spiking";
import { PainterSynapses } from "./synapses";

export class Painter extends TgdPainterGroup {
	private readonly groupSegments = new TgdPainterGroup({
		name: "GroupSegments",
	});
	private readonly groupSynapses = new TgdPainterGroup({
		name: "GroupSynapses",
	});
	private readonly groupHover = new TgdPainterGroup();
	private readonly painterSpiking: PainterSpiking;
	private readonly palette: TgdTexture2D;
	private _painterSegments: TgdPainterSegmentsMorphing | null = null;
	/**
	 * Transition between two views.
	 * For instance, 0.0 for 3D and 1.0 for Dendrogram.
	 */
	private _mix = 0;
	private _synapses: Array<{ color: string; data: Float32Array }> | null = null;
	private _spike: MorphoViewerSpikeRecord | undefined = undefined;
	private textureRender: TgdTexture2D;

	constructor(
		private readonly context: TgdContext,
		data: MorphologyData,
	) {
		super();
		this.palette = new TgdTexture2D(context)
			.loadBitmap(tgdCanvasCreatePalette(PALETTE))
			.setParams({
				magFilter: "NEAREST",
				minFilter: "NEAREST",
			});
		this.add(
			new TgdPainterClear(context, { color: [0, 0, 0, 1], depth: 1 }),
			new TgdPainterState(context, {
				depth: webglPresetDepth.less,
				children: [this.groupSegments, this.groupSynapses, this.groupHover],
			}),
		);
		const { dataset3D, datasetDendrogram } = data;
		const painterSegments = new TgdPainterSegmentsMorphing(context, {
			roundness: 18,
			minRadius: 0.5,
			datasetsPairs: [[dataset3D, datasetDendrogram]],
			material: new TgdMaterialDiffuse({
				color: this.palette,
				specularExponent: 1,
				specularIntensity: 0.25,
				lockLightsToCamera: true,
				light: new TgdLight({
					direction: new TgdVec3(0, 0, -1),
				}),
			}),
		});
		painterSegments.mix = this.mix;
		this._painterSegments = painterSegments;
		this.textureRender = new TgdTexture2D(context, {
			params: {
				minFilter: "LINEAR",
				magFilter: "LINEAR",
			},
		});
		const framebuffer1 = new TgdPainterFramebuffer(context, {
			name: "FramebufferSegments",
			children: [
				new TgdPainterClear(context, { color: [0, 0, 0, 1], depth: 1 }),
				painterSegments,
			],
			textureColor0: this.textureRender,
		});
		const painterSpiking = new PainterSpiking(context, data);
		this.painterSpiking = painterSpiking;
		const mixer = new TgdPainterMix(context, {
			texture1: framebuffer1.textureColor0,
			texture2: painterSpiking.textureOutput,
			strength: 0,
		});
		this.groupSegments.add(
			framebuffer1,
			painterSpiking,
			new TgdPainterLogic((time) => {
				const t = tgdCalcModulo(time, 0, 2);
				const d = Math.abs(t - 1);
				mixer.strength = 1.5 * tgdCalcMapRange(d, 0.3, 0, 0, 1, true) ** 3;
			}),
			mixer,
		);
		context.paint();
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

	set mix(value: number) {
		this._mix = value;
		if (this._painterSegments) {
			this._painterSegments.mix = value;
			this.painterSpiking.mix = value;
		}
	}

	get synapsesEnabled() {
		return this.groupSynapses.active;
	}

	set synapsesEnabled(value: boolean) {
		this.groupSynapses.active = value;
		this.context.paint();
	}

	get synapses() {
		return this._synapses;
	}

	set synapses(synapses: Array<{ color: string; data: Float32Array }> | null) {
		this._synapses = synapses;
		const { context, groupSynapses } = this;
		groupSynapses.delete();
		if (synapses && synapses.length > 0) {
			groupSynapses.add(new PainterSynapses(context, synapses));
		}
		this.context.paint();
	}

	highlight(segments: TgdPainterSegmentsData | null | undefined) {
		const { groupHover, context } = this;
		groupHover.delete();
		if (segments) {
			groupHover.add(new PainterHighlight(context, segments));
		}
		context.paint();
	}

	delete() {
		this.palette.delete();
		this.groupHover.delete();
		this.groupSegments.delete();
		this.groupSynapses.delete();
		this.textureRender.delete();
	}
}
