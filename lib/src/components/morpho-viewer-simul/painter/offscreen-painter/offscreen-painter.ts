/* eslint-disable no-bitwise */
import {
  TgdContext,
  type TgdDataset,
  TgdPainter,
  TgdPainterClear,
  TgdPainterGroup,
  TgdPainterLogic,
  TgdPainterSegmentsMorphing,
  TgdPainterState,
  webglPresetDepth,
} from "@tolokoban/tgd";
import type { MorphologyData } from "../morphology-data";
import type { StructureItem } from "../structure";
import { MaterialIndex } from "./material-index";

export class OffscreenPainter extends TgdPainter {
  public mix = 0;

  private _minRadius = 2;
  private readonly offscreenCanvas = new OffscreenCanvas(1, 1);
  private readonly offscreenContext: TgdContext;
  private _data: MorphologyData | undefined = undefined;
  private readonly group = new TgdPainterGroup();
  private _painterSegments: TgdPainterSegmentsMorphing | null = null;

  constructor(private readonly onscreenContext: TgdContext) {
    super();
    // onscreenContext.eventPaint.addListener(this.paint);
    const context = new TgdContext(this.offscreenCanvas, {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: false,
    });
    context.camera = onscreenContext.camera;
    this.offscreenContext = context;
    context.add(this.group);
  }

  get minRadius(): number {
    return this._minRadius;
  }
  set minRadius(minRadius: number) {
    this._minRadius = minRadius;
    if (this._painterSegments) this._painterSegments.minRadius = minRadius;
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
    const datasetsPairs: [TgdDataset, TgdDataset][] = [[data.dataset3D, data.datasetDendrogram]];
    const painter = new TgdPainterSegmentsMorphing(context, {
      roundness: 3,
      minRadius: 2,
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
    const { structure } = data;
    const [R, G, B] = context.readPixel(xScreen, yScreen);
    const value = (R + (G << 8) + (B << 16)) / 0xffffff;
    const index = Math.floor((structure.length + 2) * value) - 1;
    if (index < 0 || index > structure.length - 1) return null;

    return structure.get(index);
  }

  paint = () => {
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
