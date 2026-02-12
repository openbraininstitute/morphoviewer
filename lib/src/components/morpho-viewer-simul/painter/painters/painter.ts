import {
	type TgdContext,
	TgdLight,
	TgdMaterialDiffuse,
	TgdPainterClear,
	TgdPainterGroup,
	type TgdPainterSegmentsData,
	TgdPainterSegmentsMorphing,
	TgdPainterState,
	TgdTexture2D,
	TgdVec3,
	tgdCanvasCreatePalette,
	webglPresetDepth,
} from "@tolokoban/tgd";
import type { MorphologyData } from "../morphology-data";
import { PALETTE } from "./contants";
import { PainterHover as PainterHighlight } from "./highlight";
import { PainterSynapses } from "./synapses";

export class Painter extends TgdPainterGroup {
	private readonly groupSegments = new TgdPainterGroup();

	private readonly groupSynapses = new TgdPainterGroup();

	private readonly groupHover = new TgdPainterGroup();

	private readonly palette: TgdTexture2D;

	private _painterSegments: TgdPainterSegmentsMorphing | null = null;

	/**
	 * Transition between two views.
	 * For instance, 0.0 for 3D and 1.0 for Dendrogram.
	 */
	private _mix = 0;

	private _synapses: Array<{ color: string; data: Float32Array }> | null = null;

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
		this.groupSegments.add(painterSegments);
		context.paint();
	}

	get mix() {
		return this._mix;
	}

	set mix(value: number) {
		this._mix = value;
		if (this._painterSegments) {
			this._painterSegments.mix = value;
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
	}
}
