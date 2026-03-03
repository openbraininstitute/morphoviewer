/** biome-ignore-all lint/suspicious/noAssignInExpressions: <explanation> */
import {
	type TgdColor,
	type TgdContext,
	TgdGeometrySphereIco,
	TgdLight,
	TgdMaterialDiffuse,
	TgdMaterialGhost,
	TgdPainterClear,
	TgdPainterFramebuffer,
	TgdPainterGroup,
	TgdPainterMesh,
	TgdPainterMix,
	type TgdPainterSegmentsData,
	TgdPainterSegmentsMorphing,
	TgdPainterState,
	TgdTexture2D,
	TgdVec3,
	tgdCanvasCreatePalette,
	webglPresetBlend,
	webglPresetDepth,
} from "@tolokoban/tgd";
import type {
	MorphoViewerSpikeRecord,
	MorphoViewerSynapsesGroup,
} from "../../types/public";
import type { MorphologyData } from "../morphology-data";
import { PALETTE } from "./contants";
import { PainterHover as PainterHighlight } from "./highlight";
import { PainterSpiking } from "./spiking";
import { PainterSynapses } from "./synapses";

export class Painter extends TgdPainterGroup {
	private _minRadius = 2;
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
	private _synapses: MorphoViewerSynapsesGroup[] = [];
	private _spike: MorphoViewerSpikeRecord | undefined = undefined;
	private textureRender: TgdTexture2D;
	private readonly clear: TgdPainterClear;

	constructor(
		private readonly context: TgdContext,
		private readonly data: MorphologyData,
	) {
		super();
		this.palette = new TgdTexture2D(context)
			.loadBitmap(tgdCanvasCreatePalette(PALETTE))
			.setParams({
				magFilter: "NEAREST",
				minFilter: "NEAREST",
			});
		this.add(
			new TgdPainterState(context, {
				depth: webglPresetDepth.less,
				children: [this.groupSegments, this.groupHover],
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
		const clear = (this.clear = new TgdPainterClear(context, {
			color: [0, 0, 0, 1],
			depth: 1,
		}));
		const framebuffer1 = new TgdPainterFramebuffer(context, {
			name: "FramebufferSegments",
			children: [clear, painterSegments, this.groupSynapses],
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
			// Fake spiking
			//   new TgdPainterLogic((time) => {
			//     const t = tgdCalcModulo(time, 0, 2);
			//     const d = Math.abs(t - 1);
			//     mixer.strength = 1.5 * tgdCalcMapRange(d, 0.3, 0, 0, 1, true) ** 3;
			//   }),
			mixer,
			//   makeDebugPainter(context)
		);
		context.paint();
	}

	get minRadius(): number {
		return this._minRadius;
	}
	set minRadius(minRadius: number) {
		this._minRadius = minRadius;
		if (this._painterSegments) {
			this._painterSegments.minRadius = minRadius;
		}
	}

	set clearColor(color: TgdColor) {
		this.clear.red = color.R;
		this.clear.green = color.G;
		this.clear.blue = color.B;
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
		this.groupSynapses.forEachChild((painter) => {
			if (painter instanceof PainterSynapses) {
				painter.mix = value;
			}
		});
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

	set synapses(synapses: MorphoViewerSynapsesGroup[]) {
		this._synapses = synapses;
		const { context, groupSynapses } = this;
		groupSynapses.delete();
		if (synapses && synapses.length > 0) {
			for (const group of synapses) {
				groupSynapses.add(new PainterSynapses(context, group, this.data));
			}
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

function makeDebugPainter(context: TgdContext) {
	const geometry = new TgdGeometrySphereIco({
		center: [6.627639388754254, 14.459156076113382, 1.7206141365071137],
		radius: 10.124441881874594,
	});
	const material = new TgdMaterialGhost({
		color: [0.5, 1, 0.5, 1],
	});
	return new TgdPainterState(context, {
		depth: webglPresetDepth.less,
		blend: webglPresetBlend.alpha,
		children: [
			new TgdPainterMesh(context, {
				geometry,
				material,
			}),
		],
	});
}
