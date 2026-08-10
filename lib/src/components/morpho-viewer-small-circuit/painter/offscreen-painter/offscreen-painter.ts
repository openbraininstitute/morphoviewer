/* eslint-disable no-bitwise */
import {
  TgdContext,
  TgdPainterClear,
  TgdPainterGroup,
  TgdPainterState,
  webglPresetDepth,
} from "@tolokoban/tgd";

import { spiralPixelOffsets } from "@/morphology-picking";
import { vec3ToInt16 } from "@/utils";

import { PainterCellId } from "../painter-cell";

import type { CacheLRU } from "@/tools/cache-lru";
import type { MorphoViewerSmallCircuitCell, MorphoViewerSmallCircuitCellData } from "../../types";

export interface OffscreenPainterOptions {
  circuit: MorphoViewerSmallCircuitCell[];
  loadCell: (id: string) => Promise<MorphoViewerSmallCircuitCellData | null>;
  loadedCells: CacheLRU<Promise<MorphoViewerSmallCircuitCellData | null>>;
}

const FIRST_INDEX = 1;

/**
 * Cheap default: a cell is a large target, so a quarter-resolution buffer is plenty to say
 * which one the pointer is over, and it keeps the per-frame cost low.
 */
const DEFAULT_RESOLUTION_DIVIDER = 4;

export class OffscreenPainter {
  public mix = 0;
  public readonly context: TgdContext;
  /**
   * How much smaller than the canvas this buffer is drawn.
   *
   * Raised (to a smaller divider) while location picking is on. A click is only resolved to a
   * location when this buffer also reports a cell, so if it stays coarser than the segment
   * buffer it becomes the limiting factor: a distal dendrite registers as a segment but not as
   * a cell, and the pick is silently dropped.
   */
  public resolutionDivider = DEFAULT_RESOLUTION_DIVIDER;

  private readonly offscreenCanvas = new OffscreenCanvas(1, 1);
  private readonly offscreenContext: TgdContext;
  private readonly group = new TgdPainterGroup();
  private readonly circuit: MorphoViewerSmallCircuitCell[];
  private isDeleted = false;

  constructor(
    private readonly onscreenContext: TgdContext,
    options: OffscreenPainterOptions
  ) {
    this.circuit = options.circuit;
    onscreenContext.eventPaint.addListener(this.paint);
    const context = new TgdContext(this.offscreenCanvas, {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: false,
      depth: true,
      name: "OffscreenPainter",
    });
    this.context = context;
    context.camera = onscreenContext.camera;
    this.offscreenContext = context;
    context.add(
      new TgdPainterClear(context, { color: [0, 0, 0, 0], depth: 1 }),
      new TgdPainterState(context, {
        depth: webglPresetDepth.less,
        children: [this.group],
      })
    );
    let index = FIRST_INDEX;
    for (const cell of this.circuit) {
      const mesh = new PainterCellId(context, {
        cell,
        loadCell: options.loadCell,
        id: index,
      });
      this.group.add(mesh);
      index++;
    }
    this.paint();
  }

  getItemAt(xScreen: number, yScreen: number): MorphoViewerSmallCircuitCell | undefined {
    if (this.isDeleted) return;

    const { circuit, offscreenContext: context } = this;
    const [R, G, B] = context.readPixel(xScreen, yScreen);
    const divider = 1 / 0xff;
    const index = vec3ToInt16([R * divider, G * divider, B * divider]) - FIRST_INDEX;
    return circuit[index] ?? undefined;
  }

  /**
   * Like {@link getItemAt}, but forgiving: probes outward until it finds a cell.
   *
   * A distal dendrite covers about a pixel here, so requiring the exact pixel makes clicking
   * one a matter of luck. Reserved for clicks — hover keeps the single-pixel read so it stays
   * cheap on every pointer move.
   */
  getItemNear(
    xScreen: number,
    yScreen: number,
    radiusInPixels: number
  ): MorphoViewerSmallCircuitCell | undefined {
    if (this.isDeleted) return;

    const { offscreenCanvas } = this;
    // The pointer arrives in clip space, so a pixel step is two clip units over the width.
    const stepX = 2 / Math.max(1, offscreenCanvas.width);
    const stepY = 2 / Math.max(1, offscreenCanvas.height);
    for (const [dx, dy] of spiralPixelOffsets(radiusInPixels)) {
      const found = this.getItemAt(xScreen + dx * stepX, yScreen + dy * stepY);
      if (found) return found;
    }
    return undefined;
  }

  private readonly paint = () => {
    if (this.isDeleted) return;

    const { onscreenContext, offscreenContext, offscreenCanvas } = this;
    offscreenContext.camera = onscreenContext.camera;
    const { canvas } = onscreenContext;
    offscreenCanvas.width = Math.ceil(canvas.width / this.resolutionDivider);
    offscreenCanvas.height = Math.ceil(canvas.height / this.resolutionDivider);
    offscreenContext.paint();
  };

  delete() {
    this.onscreenContext.eventPaint.removeListener(this.paint);
    this.offscreenContext.delete();
    this.isDeleted = true;
  }
}
