import { type TgdContext, TgdPainterLogic } from "@tolokoban/tgd";

/**
 * lowest resolution the adaptive downscaler is allowed to reach.
 * Without a floor, a very slow frame drove the computed resolution to 0
 * (a 0×0 drawing buffer, i.e. a blank canvas) and then latched there.
 * A small non-zero floor keeps the scene visible (just blurrier)
 * while still relieving the GPU during interaction.
 */
const MIN_RESOLUTION = 0.2;

/**
 * Frame durations are only meaningful while the render loop is hot. Anything
 * slower than this is a stall (fullscreen relayout, point cloud rebuild, GC) or
 * the idle gap between two sparse on-demand paints — never a steady-state
 * render cost — so it is dropped instead of being fed to the controller.
 */
const MAX_VALID_FRAME_TIME = 1;

/** above this median frame time the view is too slow: take resolution away. */
const SLOW_FRAME_TIME = 1 / 32;

/** below this median frame time there is headroom: give resolution back. */
const FAST_FRAME_TIME = 1 / 50;

/**
 * Number of valid frames the controller looks at before adjusting anything.
 * Judging single frames is what let a one-off hitch (going fullscreen, changing
 * the "colour by" filter) collapse the resolution; a median over a window
 * ignores outliers and only reacts to sustained load.
 */
const WINDOW_SIZE = 8;

/** the pixel count may at most halve in one adjustment... */
const MAX_SHRINK = 0.5;

/** ...and at most grow by 40%, so recovery is quick but never overshoots. */
const MAX_GROW = 1.4;

/**
 * Renders the interactive view at a reduced resolution when — and only when —
 * sustained measurements say the machine cannot keep up.
 *
 * `lowRes()`/`highRes()` bracket an interaction (see `PainterManager`), and
 * frame durations are measured strictly between those two calls, where the
 * render loop is guaranteed to be running continuously. Idle paints, whose
 * spacing says how often something asked for a repaint rather than how long a
 * frame takes, are never measured.
 */
export class AdpatativeResolution {
  private _context: TgdContext | null = null;
  private isLowRes = false;
  private wasLowRes = false;
  /** true while an image capture owns `context.resolution`. */
  private suspended = false;
  private _resolution = 1;
  private readonly frameTimes: number[] = [];
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
    this._resolution = 1;
    this.isLowRes = false;
    this.wasLowRes = false;
    this.frameTimes.length = 0;
    const { context } = this;
    if (context) context.resolution = 1;
  }

  /**
   * Forget the frames measured so far. Call this whenever something other than
   * rendering is about to eat a frame — a canvas resize, a point cloud rebuild —
   * so that stall is not mistaken for a slow GPU.
   */
  readonly invalidate = () => {
    this.frameTimes.length = 0;
    // re-arm the grace frame: the frame right after the disturbance still
    // carries its cost (a drawing buffer reallocation, for instance).
    this.wasLowRes = false;
  };

  /** hand `context.resolution` over to an image capture. */
  suspend() {
    this.suspended = true;
    this.invalidate();
  }

  /** take `context.resolution` back, and return the live view to full res. */
  resume() {
    this.suspended = false;
    this.highRes();
  }

  readonly highRes = () => {
    const { context } = this;
    if (!context) return;

    // Closing the measurement window is unconditional. Guarding this on
    // `context.resolution !== 1` latched `isLowRes` on forever on any machine
    // fast enough never to be downscaled, which left the controller judging
    // idle paints — the gap between two unrelated repaints — as frame times.
    this.isLowRes = false;
    this.wasLowRes = false;
    this.frameTimes.length = 0;
    if (context.resolution === 1) return;

    // `context.resolution` has other owners (image capture), so restore it even
    // when this controller never lowered it.
    context.resolution = 1;
    context.paint();
  };

  readonly lowRes = () => {
    const { context } = this;
    if (!context || this.suspended || this.isLowRes) return;

    this.isLowRes = true;
    // drop the first frame of the window: its duration is the gap since the
    // last idle paint, not the cost of rendering.
    this.wasLowRes = false;
    this.frameTimes.length = 0;
    if (context.resolution === this._resolution) return;

    context.resolution = this._resolution;
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
    // only the interactive view is downscaled; while idle the context stays at
    // full resolution and picks the new value up on the next `lowRes()`.
    const { context } = this;
    if (context && this.isLowRes) context.resolution = clamped;
  }

  /**
   * Runs once per painted frame (registered first in the paint order), with
   * `delta` the duration of the previous frame, in seconds.
   */
  private readonly computeResolution = (_time: number, delta: number) => {
    const { context, isLowRes, wasLowRes } = this;
    this.wasLowRes = isLowRes;
    if (!context || this.suspended) return;

    if (!isLowRes || !wasLowRes) {
      // outside an interaction, or on its very first frame: nothing to measure.
      this.frameTimes.length = 0;
      return;
    }
    if (delta <= 0 || delta > MAX_VALID_FRAME_TIME) return;

    const { frameTimes } = this;
    frameTimes.push(delta);
    if (frameTimes.length < WINDOW_SIZE) return;

    const frameTime = median(frameTimes);
    // every decision starts from fresh evidence, so an adjustment is never
    // judged on frames rendered at the previous resolution.
    frameTimes.length = 0;
    if (frameTime > SLOW_FRAME_TIME) {
      this.rescale(Math.max(MAX_SHRINK, SLOW_FRAME_TIME / frameTime));
    } else if (frameTime < FAST_FRAME_TIME) {
      this.rescale(Math.min(MAX_GROW, FAST_FRAME_TIME / frameTime));
    }
  };

  /** apply a factor to the *pixel count*, which is the resolution squared. */
  private rescale(pixelCountFactor: number) {
    this.resolution = this.resolution * Math.sqrt(pixelCountFactor);
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}
