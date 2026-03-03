import {
	type TgdAnimation,
	type TgdColor,
	type TgdContext,
	TgdEvent,
	TgdPainterLogic,
	tgdCalcMix,
} from "@tolokoban/tgd";
import type { MorphoViewerMode } from "../types/public";
import type { OffscreenPainter } from "./offscreen-painter";
import type { Painter } from "./painters";

/**
 * Manage the transition between views.
 */
export class TransitionManager {
	public widthAtTarget = 1;
	public heightAtTarget = 1;
	public readonly eventResetCamera = new TgdEvent();
	public painter: Painter | null = null;
	public offscreen: OffscreenPainter | null = null;
	public minRadius = 2;

	private readonly logic: TgdPainterLogic;
	private _context: TgdContext | null = null;
	private _mode: MorphoViewerMode = "3d";
	private _mix = 0;
	private ongoingAnimations: TgdAnimation[] = [];

	constructor(
		public readonly clearColor: TgdColor,
		public readonly duration = 0.6,
	) {
		this.logic = new TgdPainterLogic(this.actualPaint);
	}

	get mix() {
		return this._mix;
	}
	private set mix(mix: number) {
		this._mix = mix;
	}

	get context() {
		return this._context;
	}

	set context(context: TgdContext | null) {
		if (this._context === context) return;

		this._context = context;
		if (context) {
			context.removeAll();
			context.add(this.logic);
			context.play();
		}
	}

	get mode() {
		return this._mode;
	}

	set mode(newMode: MorphoViewerMode) {
		const oldMode = this._mode;
		if (oldMode === newMode) return;

		this.scheduleAnim(newMode);
	}

	paint() {
		this.context?.paint();
	}

	delete() {
		this.painter?.delete();
		this.painter = null;
		if (this.context) {
			this.context.delete();
			this.context = null;
		}
		if (this.offscreen) {
			this.offscreen.delete();
			this.offscreen = null;
		}
	}

	private readonly actualPaint = (time: number, delta: number) => {
		const {
			painter,
			offscreen,
			context,
			widthAtTarget,
			heightAtTarget,
			minRadius,
		} = this;
		if (context) {
			context.camera.fitSpaceAtTarget(widthAtTarget, heightAtTarget);
		}
		if (painter) {
			painter.clearColor = this.clearColor;
			painter.minRadius = minRadius;
			painter.mix = this.mix;
			painter.paint(time, delta);
		}
		if (offscreen) {
			offscreen.minRadius = minRadius;
			offscreen.mix = this.mix;
		}
	};

	private readonly scheduleAnim = (newMode: MorphoViewerMode) => {
		const { context, painter, offscreen } = this;
		if (!context || !painter || !offscreen) return;

		this._mode = newMode;
		this.eventResetCamera.dispatch();
		if (newMode === "dendrogram") {
			context.animCancelArray(this.ongoingAnimations);
			const mixStart = this.mix;
			const mixEnd = 1;
			this.ongoingAnimations = context.animSchedule({
				duration: this.duration * Math.abs(mixEnd - mixStart),
				action: (alpha) => {
					this.mix = tgdCalcMix(mixStart, mixEnd, alpha);
				},
			});
		} else if (newMode === "3d") {
			context.animCancelArray(this.ongoingAnimations);
			const mixStart = this.mix;
			const mixEnd = 0;
			this.ongoingAnimations = context.animSchedule({
				duration: this.duration * Math.abs(mixEnd - mixStart),
				action: (alpha) => {
					this.mix = tgdCalcMix(mixStart, mixEnd, alpha);
				},
			});
		}
	};
}
