/* eslint-disable no-bitwise */
import {
  TgdContext,
  TgdPainterClear,
  TgdPainterGroup,
  TgdPainterState,
  webglPresetDepth,
} from "@tolokoban/tgd";

import { decodePickColor, spiralPixelOffsets } from "@/morphology-picking";

import { PainterCellId } from "../painter-cell";
import { CLOUD_FIRST_INDEX, PainterCellSomasId } from "../painter-cell-somas";
import { isSameCell } from "../same-cell";

import type { MorphoViewerSmallCircuitCell, MorphoViewerSmallCircuitCellData } from "../../types";
import type { SomaCloudData } from "../painter-cell-somas";

export interface OffscreenPainterOptions {
  circuit: MorphoViewerSmallCircuitCell[];
  loadCell: (id: string) => Promise<MorphoViewerSmallCircuitCellData | null>;
  /** The cells drawn as a soma alone, built once by the caller. @see setCircuit */
  somas: SomaCloudData;
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
  /** The painter drawing each cell, by cell id, with the index it paints itself as. */
  private readonly meshes = new Map<string, { mesh: PainterCellId; index: number }>();
  /**
   * The cell behind each index, which is what a read pixel resolves to.
   *
   * An index belongs to the painter that was given it and is only handed on once that painter
   * is gone, so a cell that stays on screen keeps the colour it is drawn in — which is what
   * lets this buffer be updated rather than built again.
   */
  private readonly cellByIndex: (MorphoViewerSmallCircuitCell | undefined)[] = [];
  private readonly freeIndices: number[] = [];
  /**
   * The silhouettes of the cells drawn as a soma alone, and the cell behind each instance.
   *
   * Rebuilt whole on every update rather than kept: it is one program and one buffer for all
   * of them, which is the point of drawing them this way.
   */
  private cloud: PainterCellSomasId | null = null;
  private cloudCells: MorphoViewerSmallCircuitCell[] = [];
  private mix = 0;
  private isDeleted = false;

  constructor(
    private readonly onscreenContext: TgdContext,
    options: OffscreenPainterOptions
  ) {
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
    this.mix = options.dendrogramMix ?? 0;
    this.setCircuit(options.circuit, options.loadCell, options.somas);
  }

  /**
   * Draw these cells instead, keeping the painters that already draw them.
   *
   * A painter compiles a shader program of its own, so building one for every cell on every
   * update is the most expensive thing this buffer can do — and a population hidden or put on
   * show leaves most of them untouched.
   *
   * `somas` is handed in rather than built here: the visible cloud draws from the same data,
   * and a pick resolves to the cell the eye was on only while instance `i` means the same cell
   * in both. Sharing the one array is what holds that, where two builds only ever happened to
   * agree.
   */
  setCircuit(
    circuit: MorphoViewerSmallCircuitCell[],
    loadCell: (id: string) => Promise<MorphoViewerSmallCircuitCellData | null>,
    somas: SomaCloudData
  ) {
    const kept = new Map(this.meshes);
    this.meshes.clear();
    // Emptied and refilled rather than picked apart: removing one painter at a time walks the
    // list for each of them.
    this.group.removeAll(false);
    for (const cell of circuit) {
      // Drawn by the cloud below, which numbers its own instances.
      if (cell.somaOnly) continue;

      const previous = kept.get(cell.id);
      kept.delete(cell.id);
      if (previous && isSameCell(previous.mesh.cell, cell)) {
        this.meshes.set(cell.id, previous);
        this.group.add(previous.mesh);
        continue;
      }
      // A cell drawn differently keeps the index it already had: its painter goes, the colour
      // it is picked out by does not.
      previous?.mesh.delete();
      const index =
        previous?.index ?? this.freeIndices.pop() ?? this.cellByIndex.length + FIRST_INDEX;
      const mesh = new PainterCellId(this.context, { cell, loadCell, id: index });
      mesh.dendrogramMix = this.mix;
      this.cellByIndex[index - FIRST_INDEX] = cell;
      this.meshes.set(cell.id, { mesh, index });
      this.group.add(mesh);
    }
    // What no cell claimed has left the scene, and its index goes back in the pool. A cell
    // that turned into a soma alone is among them: it is in the cloud now.
    for (const { mesh, index } of kept.values()) {
      mesh.delete();
      this.cellByIndex[index - FIRST_INDEX] = undefined;
      this.freeIndices.push(index);
    }
    this.cloud?.delete();
    this.cloud = null;
    this.cloudCells = somas.cells;
    if (somas.cells.length > 0) {
      const cloud = new PainterCellSomasId(this.context, somas.dataPoint);
      this.cloud = cloud;
      this.group.add(cloud);
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
    this.mix = mix;
    for (const { mesh } of this.meshes.values()) mesh.dendrogramMix = mix;
  }

  getItemAt(xScreen: number, yScreen: number): MorphoViewerSmallCircuitCell | undefined {
    if (this.isDeleted) return;

    const { cellByIndex, offscreenContext: context } = this;
    const index = decodePickColor(context.readPixel(xScreen, yScreen));
    if (index === null) return;

    return index >= CLOUD_FIRST_INDEX
      ? this.cloudCells[index - CLOUD_FIRST_INDEX]
      : (cellByIndex[index - FIRST_INDEX] ?? undefined);
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
