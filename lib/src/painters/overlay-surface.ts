import {
  TgdContext,
  TgdPainterClear,
  TgdPainterState,
} from "@tolokoban/tgd";

import { PainterWorldOverlays } from "./world-overlays";

/**
 * Second WebGL canvas stacked above the circuit for electrode markers only.
 *
 * Why: mid-drag we must repaint electrodes every frame. Doing that on the
 * circuit context also re-draws dense morphologies → lag. Freezing the circuit
 * into a texture failed (MSAA / async paint → black). Keeping the circuit
 * canvas untouched during drag leaves its last frame on screen for free;
 * only this cheap transparent surface repaints.
 */
export class OverlaySurface {
  private context: TgdContext | null = null;
  private painter: PainterWorldOverlays | null = null;
  private main: TgdContext | null = null;
  private dragging = false;
  private readonly onMainPaint = () => {
    if (this.dragging) return;
    this.paint();
  };

  get overlaysPainter(): PainterWorldOverlays | null {
    return this.painter;
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  /**
   * Bind / unbind the overlay canvas. Pass the circuit `TgdContext` so cameras
   * stay shared (picking on the main canvas matches overlay drawing).
   */
  setCanvas(canvas: HTMLCanvasElement | null, main: TgdContext | null) {
    this.teardown();
    this.main = main;
    if (!canvas || !main) return;

    const context = new TgdContext(canvas, {
      antialias: true,
      alpha: true,
      // Transparent clear so the circuit canvas shows through.
      premultipliedAlpha: true,
      name: "OverlaySurface",
    });
    context.camera = main.camera;
    context.resolution = main.resolution;

    const painter = new PainterWorldOverlays(context);
    this.painter = painter;
    this.context = context;

    const clear = new TgdPainterClear(context, {
      name: "Clear overlay surface",
      color: [0, 0, 0, 0],
      depth: 1,
    });
    context.add(
      clear,
      new TgdPainterState(context, {
        depth: "off",
        blend: "off",
        cull: "back",
        children: [painter],
      })
    );

    main.eventPaint.addListener(this.onMainPaint);
    context.paint();
  }

  /** Electrode gesture started — freeze circuit canvas (do not paint it). */
  beginDrag() {
    this.dragging = true;
  }

  /** Gesture ended — refresh circuit once, then resume paired paints. */
  endDrag() {
    this.dragging = false;
    this.main?.paint();
    this.paint();
  }

  paint() {
    const { context, main } = this;
    if (!context || !main) return;
    context.camera = main.camera;
    context.resolution = main.resolution;
    context.paint();
  }

  delete() {
    this.teardown();
  }

  private teardown() {
    if (this.main) {
      this.main.eventPaint.removeListener(this.onMainPaint);
    }
    this.context?.delete();
    this.context = null;
    this.painter = null;
    this.main = null;
    this.dragging = false;
  }
}
