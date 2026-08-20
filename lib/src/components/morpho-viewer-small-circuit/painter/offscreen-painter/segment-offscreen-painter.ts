import {
  TgdContext,
  TgdPainterClear,
  TgdPainterGroup,
  TgdPainterState,
  webglPresetDepth,
} from "@tolokoban/tgd";

import { decodeSegmentIndex, spiralPixelOffsets } from "@/morphology-picking";

import { PainterCell } from "../painter-cell";

import type { MorphoViewerSmallCircuitCell, MorphoViewerSmallCircuitCellData } from "../../types";
import type { CellSectionIndex, CellSegment } from "../painter-cell/factory/section-index";

/**
 * A second pick buffer, holding a segment index per pixel instead of a cell index.
 *
 * Separate from {@link OffscreenPainter} rather than sharing its 24 bits: that pass drives
 * hover and cell selection, which ship today. A click reads both at the same pixel — cell
 * from there, segment from here.
 *
 * Half resolution, against the cell pass's quarter: a distal dendrite is about a pixel wide.
 */
const RESOLUTION_DIVIDER = 2;

export interface SegmentOffscreenPainterOptions {
  circuit: MorphoViewerSmallCircuitCell[];
  loadCell: (id: string) => Promise<MorphoViewerSmallCircuitCellData | null>;
  /**
   * Called once a cell's geometry, and so its section index, is available.
   *
   * Morphologies stream in one at a time; without this a restored selection resolves to
   * nothing and stays invisible until an unrelated redraw comes along.
   */
  onCellLoaded?: () => void;
  /** Current dendrogram morph, so a rebuilt buffer matches what is on screen. */
  dendrogramMix?: number;
}

export class SegmentOffscreenPainter {
  public readonly context: TgdContext;

  private readonly offscreenCanvas = new OffscreenCanvas(1, 1);
  private readonly offscreenContext: TgdContext;
  private readonly group = new TgdPainterGroup();
  /** Cell id → its painter, so a decoded index can be resolved against the right cell. */
  private readonly cellPainters = new Map<string, PainterCell>();
  private isDeleted = false;

  constructor(
    private readonly onscreenContext: TgdContext,
    options: SegmentOffscreenPainterOptions
  ) {
    onscreenContext.eventPaint.addListener(this.paint);
    const context = new TgdContext(this.offscreenCanvas, {
      preserveDrawingBuffer: true,
      // Antialiasing would average two neighbouring indices into a third, unrelated one.
      antialias: false,
      alpha: false,
      depth: true,
      name: "SegmentOffscreenPainter",
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
    for (const cell of options.circuit) {
      const painter = new PainterCell(context, {
        cell,
        loadCell: options.loadCell,
        material: "segment",
        onCellLoaded: () => options.onCellLoaded?.(),
      });
      // Seeded, not pushed: enabling location picking rebuilds this buffer.
      painter.dendrogramMix = options.dendrogramMix ?? 0;
      this.cellPainters.set(cell.id, painter);
      this.group.add(painter);
    }
    this.paint();
  }

  /**
   * Keep the pick geometry on the same morph as what is drawn.
   *
   * Otherwise a click resolves against a shape the user cannot see. No repaint here: this
   * buffer redraws on the main context's `eventPaint`, which the caller triggers once.
   */
  set dendrogramMix(mix: number) {
    for (const painter of this.cellPainters.values()) painter.dendrogramMix = mix;
  }

  /** This cell's section index, once its morphology has loaded. */
  getSections(cell: MorphoViewerSmallCircuitCell): CellSectionIndex | null {
    return this.cellPainters.get(cell.id)?.sections ?? null;
  }

  /**
   * The segment near this pixel for `cell`, probing outward so a near miss still resolves.
   *
   * The caller supplies the cell: every cell numbers its segments from zero, so this buffer
   * alone cannot say which one was hit. The search radius must match the cell buffer's, or
   * the stricter of the two silently decides the outcome.
   */
  getSegmentNear(
    cell: MorphoViewerSmallCircuitCell,
    xScreen: number,
    yScreen: number,
    radiusInPixels: number
  ): CellSegment | undefined {
    if (this.isDeleted) return;

    const { offscreenCanvas } = this;
    const stepX = 2 / Math.max(1, offscreenCanvas.width);
    const stepY = 2 / Math.max(1, offscreenCanvas.height);
    for (const [dx, dy] of spiralPixelOffsets(radiusInPixels)) {
      const found = this.getSegmentAt(cell, xScreen + dx * stepX, yScreen + dy * stepY);
      if (found) return found;
    }
    return undefined;
  }

  private getSegmentAt(
    cell: MorphoViewerSmallCircuitCell,
    xScreen: number,
    yScreen: number
  ): CellSegment | undefined {
    const sections = this.getSections(cell);
    if (!sections) return;

    const [R, G, B] = this.offscreenContext.readPixel(xScreen, yScreen);
    const value = (R + G * 256 + B * 256 * 256) / 0xffffff;
    const index = decodeSegmentIndex(value, sections.length);
    if (index < 0) return;

    return sections.get(index);
  }

  private readonly paint = () => {
    if (this.isDeleted) return;

    const { onscreenContext, offscreenContext, offscreenCanvas } = this;
    offscreenContext.camera = onscreenContext.camera;
    const { canvas } = onscreenContext;
    offscreenCanvas.width = Math.ceil(canvas.width / RESOLUTION_DIVIDER);
    offscreenCanvas.height = Math.ceil(canvas.height / RESOLUTION_DIVIDER);
    offscreenContext.paint();
  };

  delete() {
    this.onscreenContext.eventPaint.removeListener(this.paint);
    // Mark the cell painters deleted before the context goes: a cell whose morphology is
    // still downloading will come back to build geometry, and needs to find itself disposed
    // rather than holding a context that no longer exists.
    for (const painter of this.cellPainters.values()) painter.delete();
    this.offscreenContext.delete();
    this.cellPainters.clear();
    this.isDeleted = true;
  }
}
