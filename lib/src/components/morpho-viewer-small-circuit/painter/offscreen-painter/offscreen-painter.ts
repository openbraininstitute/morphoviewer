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

import type { MorphoViewerSmallCircuitCell, MorphoViewerSmallCircuitCellData } from "../../types";

export interface OffscreenPainterOptions {
  circuit: MorphoViewerSmallCircuitCell[];
  loadCell: (id: string) => Promise<MorphoViewerSmallCircuitCellData | null>;
  /** Current dendrogram morph, so a rebuilt buffer matches what is on screen. */
  dendrogramMix?: number;
}

const FIRST_INDEX = 1;

/**
 * Cheap default: a cell is a large target, so a quarter-resolution buffer is plenty to say
 * which one the pointer is over, and it keeps the per-frame cost low.
 */
const DEFAULT_RESOLUTION_DIVIDER = 4;

export class OffscreenPainter {
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
  private readonly meshes: PainterCellId[] = [];
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
      // Seeded, not pushed: this buffer is rebuilt on every circuit update.
      mesh.dendrogramMix = options.dendrogramMix ?? 0;
      this.group.add(mesh);
      this.meshes.push(mesh);
      index++;
    }
    this.paint();
  }

  /**
   * Keep the pick geometry on the same morph as what is drawn.
   *
   * No repaint here: this buffer redraws on the main context's `eventPaint`, and the caller
   * paints once it has moved everything else the morph touches.
   */
  set dendrogramMix(mix: number) {
    for (const mesh of this.meshes) mesh.dendrogramMix = mix;
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
