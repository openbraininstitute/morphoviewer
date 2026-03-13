import {
  type TgdAnimation,
  TgdColor,
  type TgdContext,
  TgdEvent,
  TgdPainter,
  TgdPainterClear,
  TgdPainterGroup,
  TgdPainterLogic,
  tgdCalcMix,
} from "@tolokoban/tgd";
import type { MorphoViewerMode, MorphoViewerSynapsesGroup } from "../types/public";
import type { OffscreenPainter } from "./offscreen-painter";
import type { Painter } from "./painters";

export interface TransitionManagerOptions {
  clearColor: string;
}

/**
 * Manage the transition between views.
 */
export class TransitionManager extends TgdPainterGroup {
  public widthAtTarget = 1;
  public heightAtTarget = 1;
  public readonly eventResetCamera = new TgdEvent();
  /** Transition duration in seconds */
  public duration = 0.6;

  private _painter: Painter | null = null;
  private _offscreen: OffscreenPainter | null = null;
  private _clearColor = "";
  private _mode: MorphoViewerMode = "3d";
  private _minRadius = 2;
  private _synapsesEnabled = false;
  private _synapses: MorphoViewerSynapsesGroup[] = [];
  private _mix = 0;
  private ongoingAnimations: TgdAnimation[] = [];
  private readonly clear: TgdPainterClear;

  constructor(
    public readonly context: TgdContext,
    { clearColor = "#004" }: Partial<TransitionManagerOptions> = {},
  ) {
    super({ name: "TransitionManager" });
    this.clear = new TgdPainterClear(context, { color: [0, 0, 0, 1], depth: 1 });
    this.add(this.clear, this.beforePaint);
    this.clearColor = clearColor;
  }

  get minRadius(): number {
    return this._minRadius;
  }
  set minRadius(minRadius: number) {
    if (this._minRadius === minRadius) return;

    this._minRadius = minRadius;
    const { painter, offscreen } = this;
    if (painter) painter.minRadius = minRadius;
    if (offscreen) offscreen.minRadius = minRadius;
  }

  get painter(): Painter | null {
    return this._painter;
  }
  set painter(painter: Painter | null) {
    const { _painter } = this;
    if (_painter === painter) return;

    if (_painter) this.remove(_painter);
    if (painter) {
      this.add(painter);
      painter.synapsesEnabled = this.synapsesEnabled;
      painter.synapses = this.synapses;
      painter.mix = this.mix;
      painter.minRadius = this.minRadius;
    }
    this._painter = painter;
    this.context.paint();
  }

  get offscreen(): OffscreenPainter | null {
    return this._offscreen;
  }
  set offscreen(offscreen: OffscreenPainter | null) {
    const { _offscreen } = this;
    if (_offscreen === offscreen) return;

    if (_offscreen) this.remove(_offscreen);
    if (offscreen) {
      this.add(offscreen);
      offscreen.mix = this.mix;
      offscreen.minRadius = this.minRadius;
    }
    this._offscreen = offscreen;
    this.context.paint();
  }

  get clearColor(): string {
    return this._clearColor;
  }
  set clearColor(clearColor: string) {
    if (this._clearColor === clearColor) return;

    this._clearColor = clearColor;
    const color = TgdColor.fromString(clearColor);
    const { clear } = this;
    clear.red = color.R;
    clear.green = color.G;
    clear.blue = color.B;
    clear.alpha = color.A;
    this.context.paint();
  }

  get synapsesEnabled(): boolean {
    return this._synapsesEnabled;
  }
  set synapsesEnabled(synapsesEnabled: boolean) {
    this._synapsesEnabled = synapsesEnabled;
    const { painter } = this;
    if (painter) painter.synapsesEnabled = synapsesEnabled;
  }

  get synapses(): MorphoViewerSynapsesGroup[] {
    return this._synapses;
  }
  set synapses(synapses: MorphoViewerSynapsesGroup[]) {
    if (this._synapses === synapses) return;

    this._synapses = synapses;
    const { painter } = this;
    if (painter) painter.synapses = synapses;
  }

  get mix() {
    return this._mix;
  }
  private set mix(mix: number) {
    if (this._mix === mix) return;

    this._mix = mix;
    const { painter, offscreen } = this;
    if (painter) painter.mix = mix;
    if (offscreen) offscreen.mix = mix;
  }

  get mode() {
    return this._mode;
  }

  set mode(newMode: MorphoViewerMode) {
    const oldMode = this._mode;
    if (oldMode === newMode) return;

    this.scheduleAnim(newMode);
  }

  private readonly beforePaint = () => {
    const { context, widthAtTarget, heightAtTarget } = this;
    context?.camera.fitSpaceAtTarget(widthAtTarget, heightAtTarget);
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
