import { type TgdContext, TgdPainterLogic } from "@tolokoban/tgd";

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
    if (this._resolution === resolution) return;

    this._resolution = resolution;
    const { context } = this;
    if (context) context.resolution = resolution;
  }

  private readonly computeResolution = () => {
    const { wasLowRes, isLowRes, context } = this;
    if (!context) return;

    this.wasLowRes = isLowRes;
    const minFPS = 30;
    const { fps } = context;
    if (isLowRes && wasLowRes) {
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
