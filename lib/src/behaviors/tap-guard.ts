import type { TgdContext, TgdInputPointerEventMove, TgdInputPointerEventTap } from "@tolokoban/tgd";

/** A click may wander this many CSS pixels. Past that the gesture is a drag. */
const CLICK_SLOP_IN_PIXELS = 5;

/**
 * A click may take this long, in seconds. Longer than this and the button was
 * being held, which in a 3D scene is how the camera is turned.
 *
 * Measured here rather than left to tgd, whose own tap test compares a duration
 * in seconds against `tapDelay`, documented and set as 300 milliseconds. Every
 * press short of five minutes therefore arrives as a tap.
 */
const MAX_CLICK_IN_SECONDS = 0.5;

/**
 * Above the overlay interaction's, which stops the dispatch while it drags an
 * electrode. This one only records, and never stops anything.
 */
const PRIORITY = 100;

/** Whether a move of `dx`,`dy` clip units left the slop circle. */
export function movedBeyondSlop(
  dx: number,
  dy: number,
  widthInPixels: number,
  heightInPixels: number
): boolean {
  // No canvas size to convert with, so nothing can be said and the click stands.
  if (widthInPixels <= 0 || heightInPixels <= 0) return false;

  return Math.hypot((dx * widthInPixels) / 2, (dy * heightInPixels) / 2) > CLICK_SLOP_IN_PIXELS;
}

/**
 * Whether the press that just ended was a click rather than a camera move.
 *
 * Comparing where a press started with where it ended is not enough on its own:
 * an orbit that wanders and comes back ends a pixel from where it began, and
 * reads as a pointer that never moved. So the whole path is watched, and once
 * the pointer has left the slop circle the gesture stays a drag until the
 * button comes back up.
 *
 * Distances are taken in CSS pixels. The drawing buffer is the wrong ruler: it
 * is `clientWidth * resolution`, and the adaptive downscaler drops that
 * resolution as low as a fifth *during* an interaction, which is exactly when
 * this measurement is made. Slop measured there quietly grows fivefold on the
 * slow scenes that need it most.
 */
export class TapGuard {
  private context: TgdContext | null = null;
  private dragged = false;
  private startX = 0;
  private startY = 0;
  private widthInPixels = 0;
  private heightInPixels = 0;

  attach(context: TgdContext) {
    this.context = context;
    context.inputs.pointer.eventMoveStart.addListener(this.handleMoveStart, PRIORITY);
    context.inputs.pointer.eventMove.addListener(this.handleMove, PRIORITY);
  }

  detach() {
    const { context } = this;
    if (!context) return;

    context.inputs.pointer.eventMoveStart.removeListener(this.handleMoveStart);
    context.inputs.pointer.eventMove.removeListener(this.handleMove);
    this.context = null;
  }

  /** The pointer went down at `x`,`y` on a canvas of this CSS size. */
  begin(x: number, y: number, widthInPixels: number, heightInPixels: number) {
    this.dragged = false;
    this.startX = x;
    this.startY = y;
    this.widthInPixels = widthInPixels;
    this.heightInPixels = heightInPixels;
  }

  /** The pointer reached `x`,`y` with the button still down. */
  move(x: number, y: number) {
    if (this.dragged) return;

    this.dragged = movedBeyondSlop(
      x - this.startX,
      y - this.startY,
      this.widthInPixels,
      this.heightInPixels
    );
  }

  isClick(evt: TgdInputPointerEventTap): boolean {
    if (this.dragged) return false;
    if (evt.t - evt.start.t > MAX_CLICK_IN_SECONDS) return false;

    // The path is only as dense as the move events that arrived: a pointer that
    // jumped and released within one frame produced none to latch on.
    return !movedBeyondSlop(
      evt.x - evt.start.x,
      evt.y - evt.start.y,
      this.widthInPixels,
      this.heightInPixels
    );
  }

  private readonly handleMoveStart = (evt: TgdInputPointerEventMove) => {
    const { canvas } = this.context ?? {};
    const sized = canvas && "clientWidth" in canvas;
    this.begin(
      evt.start.x,
      evt.start.y,
      sized ? canvas.clientWidth : 0,
      sized ? canvas.clientHeight : 0
    );
  };

  private readonly handleMove = (evt: TgdInputPointerEventMove) => {
    this.move(evt.current.x, evt.current.y);
  };
}
