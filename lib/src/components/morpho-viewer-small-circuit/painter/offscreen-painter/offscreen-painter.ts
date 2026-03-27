/* eslint-disable no-bitwise */
import {
  TgdContext,
  TgdPainterClear,
  TgdPainterGroup,
  TgdPainterState,
  webglPresetDepth,
} from "@tolokoban/tgd";
import { vec3ToInt16 } from "@/utils";
import type {
  MorphoViewerSmallCircuitCell,
  MorphoViewerSmallCircuitCellData,
} from "../../types";
import { PainterCell } from "../painter-cell";
import { CacheLRU } from "@/tools/cache-lru";

export interface OffscreenPainterOptions {
  circuit: MorphoViewerSmallCircuitCell[];
  loadCell: (id: string) => Promise<MorphoViewerSmallCircuitCellData | null>;
  loadedCells: CacheLRU<Promise<MorphoViewerSmallCircuitCellData|null>>;
}

const FIRST_INDEX = 1;

export class OffscreenPainter {
  public mix = 0;

  private readonly offscreenCanvas = new OffscreenCanvas(1, 1);
  private readonly offscreenContext: TgdContext;
  private readonly group = new TgdPainterGroup();
  private readonly circuit: MorphoViewerSmallCircuitCell[];

  constructor(
    private readonly onscreenContext: TgdContext,
    options: OffscreenPainterOptions,
  ) {
    this.circuit = options.circuit;
    onscreenContext.eventPaint.addListener(this.paint);
    const context = new TgdContext(this.offscreenCanvas, {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: false,
      depth: true,
    });
    context.camera = onscreenContext.camera;
    this.offscreenContext = context;
    context.add(
      new TgdPainterClear(context, { color: [0, 0, 0, 0], depth: 1 }),
      new TgdPainterState(context, {
        depth: webglPresetDepth.less,
        children: [this.group],
      }),
    );
    let index = FIRST_INDEX;
    for (const cell of this.circuit) {
      const mesh = new PainterCell(context, {
        cell,
        loadCell: options.loadCell,
        matrerial: index,
      });
      this.group.add(mesh);
      index++;
    }
    this.paint();
  }

  getItemAt(
    xScreen: number,
    yScreen: number,
  ): MorphoViewerSmallCircuitCell | undefined {
    const { circuit, offscreenContext: context } = this;
    const [R, G, B] = context.readPixel(xScreen, yScreen);
    const divider = 1 / 0xff;
    const index =
      vec3ToInt16([R * divider, G * divider, B * divider]) - FIRST_INDEX;
    return circuit[index] ?? undefined;
  }

  private readonly paint = () => {
    const { onscreenContext, offscreenContext, offscreenCanvas } = this;
    offscreenContext.camera = onscreenContext.camera;
    const { canvas } = onscreenContext;
    const w = Math.ceil(canvas.width / 4);
    const h = Math.ceil(canvas.height / 4);
    offscreenCanvas.width = w;
    offscreenCanvas.height = h;
    offscreenContext.paint();
  };

  delete() {
    this.onscreenContext.eventPaint.removeListener(this.paint);
    this.offscreenContext.delete();
  }
}
