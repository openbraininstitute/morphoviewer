import { MorphologyData } from "../morphology-data";
/* eslint-disable no-bitwise */
import {
  TgdContext,
  TgdDataset,
  TgdPainterClear,
  TgdPainterGroup,
  TgdPainterLogic,
  TgdPainterSegmentsMorphing,
  TgdPainterState,
  webglPresetDepth,
} from "@tolokoban/tgd";

import { StructureItem } from "../structure";
import { MaterialIndex } from "./material-index";

export class OffscreenPainter {
  public mix = 0;

  private readonly offscreenCanvas = new OffscreenCanvas(1, 1);

  private readonly offscreenContext: TgdContext;

  private _data: MorphologyData | undefined = undefined;

  private readonly group = new TgdPainterGroup();

  constructor(private readonly onscreenContext: TgdContext) {
    onscreenContext.eventPaint.addListener(this.paint);
    const context = new TgdContext(this.offscreenCanvas, {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: false,
    });
    context.camera = onscreenContext.camera;
    this.offscreenContext = context;
    context.add(this.group);
    this.paint();
  }

  get data() {
    return this._data;
  }

  set data(data: MorphologyData | undefined) {
    if (data === this._data) return;

    this._data = data;
    this.group.delete();
    if (!data) return;

    const context = this.offscreenContext;
    const datasetsPairs: [TgdDataset, TgdDataset][] = [
      [data.dataset3D, data.datasetDendrogram],
    ];
    const painter = new TgdPainterSegmentsMorphing(context, {
      roundness: 3,
      minRadius: 3,
      datasetsPairs,
      material: new MaterialIndex(),
    });
    this.group.add(
      new TgdPainterLogic(() => {
        painter.mix = this.mix;
      }),
      new TgdPainterClear(context, { color: [0, 0, 0, 1], depth: 1 }),
      new TgdPainterState(context, {
        depth: webglPresetDepth.lessOrEqual,
        children: [painter],
      }),
    );
  }

  getItemAt(xScreen: number, yScreen: number): StructureItem | null {
    const { data, offscreenContext: context } = this;
    if (!data) return null;
    const bytes = new Uint8Array(context.width * context.height * 4);
    context.gl.readPixels(
      0,
      0,
      context.width,
      context.height,
      context.gl.RGBA,
      context.gl.UNSIGNED_BYTE,
      bytes,
    );
    const { structure } = data;
    const [R, G, B] = context.readPixel(xScreen, yScreen);
    const value = (R + (G << 8) + (B << 16)) / 0xffffff;
    const index = Math.floor((structure.length + 2) * value) - 1;
    if (index < 0 || index > structure.length - 1) return null;

    return structure.get(index);
  }

  private readonly paint = () => {
    const { onscreenContext, offscreenContext, offscreenCanvas } = this;
    offscreenContext.camera = onscreenContext.camera;
    const { canvas } = onscreenContext;
    const w = Math.ceil(canvas.width / 2);
    const h = Math.ceil(canvas.height / 2);
    offscreenCanvas.width = w;
    offscreenCanvas.height = h;
    offscreenContext.paint();
  };

  delete() {
    this.onscreenContext.eventPaint.removeListener(this.paint);
    this.offscreenContext.delete();
  }
}
