import { type TgdContext, TgdPainterLogic } from "@tolokoban/tgd";

/**
 * lowest resolution the adaptive downscaler is allowed to reach
 * without a floor a very slow frame makes `context.fps` read 0, which drives the computed
 * resolution to 0 (a 0×0 drawing buffer, i.e. a blank canvas) and then latches
 * there
 * a small non-zero floor keeps the scene visible (just blurrier)
 * while still relieving the GPU during interaction.
 */
const MIN_RESOLUTION = 0.2;

export class AdpatativeResolution {
  private _context: TgdContext | null = null;
  private isLowRes = false;
  private wasLowRes = false;
  private lastTime = -1;
  private _resolution = 1;
  private countSlowFrame = 0;
  private readonly logic: TgdPainterLogic;

  constructor() {
    this.logic = new TgdPainterLogic(this.computeResolution, { name: "AdpatativeResolution" });
  }

  get context(): TgdContext | null {
    return this._context;
  }
  set context(context: TgdContext | null) {
    if (this._context === context) return;

    if (this._context) {
      this._context.remove(this.logic);
    }
    this._context = context;
    this.reset();
    context?.addFirst(this.logic);
  }

  reset() {
    this.resolution = 1;
    this.isLowRes = false;
    this.wasLowRes = false;
  }

  readonly highRes = () => {
    const { context } = this;
    if (!context) return;

    if (context.resolution === 1) return;

    context.resolution = 1;
    this.isLowRes = false;
    context.paint();
  };

  readonly lowRes = () => {
    const { context } = this;
    if (!context) return;

    if (context.resolution !== 1) return;

    context.resolution = this.resolution;
    this.isLowRes = true;
    context.paint();
  };

  private get resolution(): number {
    return this._resolution;
  }
  private set resolution(resolution: number) {
    // clamp to a visible range: never below MIN_RESOLUTION (0 would blank the
    // canvas) and never above full resolution.
    const clamped = Math.min(1, Math.max(MIN_RESOLUTION, resolution));
    if (this._resolution === clamped) return;

    this._resolution = clamped;
    const { context } = this;
    if (context) context.resolution = clamped;
  }

  private readonly computeResolution = () => {
    const { wasLowRes, isLowRes, context } = this;
    if (!context) return;

    this.wasLowRes = isLowRes;
    const minFPS = 30;
    const { fps } = context;
    // fps === 0 means the last frame was slower than ~1s: treat it as a one-off
    // stall (GC, tab blur, first heavy frame), not a steady-state signal — using
    // it in the ratio below would collapse the resolution toward 0.
    if (isLowRes && wasLowRes && fps > 0) {
      if (fps < minFPS) {
        this.countSlowFrame++;
        if (this.countSlowFrame > 1) {
          // Only reduce the resolution after two consecutive slow frames.
          const curPixelsCount = this.resolution ** 2;
          const nxtPixelsCount = (curPixelsCount * fps) / minFPS;
          this.resolution = Math.sqrt(nxtPixelsCount);
          this.countSlowFrame = 0;
        }
      } else {
        this.countSlowFrame = 0;
      }
    } else {
      this.countSlowFrame = 0;
    }
  };
}
