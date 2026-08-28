import {
  TgdBoundingBox,
  TgdColor,
  type TgdContext,
  TgdPainterGroup,
  TgdPainterPointsCloud,
  TgdTexture2D,
  tgdCanvasCreatePalette,
} from "@tolokoban/tgd";

import type { SomaCloudData } from "./soma-cloud-data";

/**
 * How far past its soma a cell is assumed to reach, as a multiple of the soma's radius.
 *
 * The same guess `PainterCell` makes before a morphology arrives, kept so that a scene of
 * context somas frames exactly as it did when each was a mesh of its own.
 */
const BBOX_RADIUS_FACTOR = 5;

export interface PainterCellSomasOptions extends Omit<SomaCloudData, "cells"> {
  /** Neuron opacity in `[0..1]`, baked into the palette's alpha. Default `1`. */
  opacity?: number;
}

/**
 * Every cell drawn as a soma and nothing else, in one instanced cloud.
 *
 * A cell the host has no morphology for is a single sphere, and a small circuit is mostly
 * those: the population beside the one on show is drawn for context alone. As a `PainterCell`
 * each cost three shader programs — drawn, highlighted, and its silhouette in the pick buffer
 * — compiled and linked on the spot, which is what made a scene of a few thousand context
 * cells take seconds to build and thousands of draw calls to paint. Here they are one buffer,
 * one program and one draw call, the way `PainterLocationMarkers` and `PainterSynapses`
 * already draw their points.
 *
 * What that gives up is per-cell brightness: a cloud soma is not brightened on hover and does
 * not glow with a spike. Both belong to the population on show, which is drawn in full.
 */
export class PainterCellSomas extends TgdPainterGroup {
  private readonly texture: TgdTexture2D;
  private readonly palette: readonly string[];
  private readonly _bbox = new TgdBoundingBox();
  private _opacity: number;

  constructor(
    public readonly context: TgdContext,
    options: PainterCellSomasOptions
  ) {
    super({ name: "PainterCellSomas" });
    const { dataPoint, dataUV } = options;
    this.palette = options.palette;
    this._opacity = options.opacity ?? 1;
    this.texture = new TgdTexture2D(context, {
      params: { magFilter: "NEAREST", minFilter: "NEAREST" },
    });
    this.loadPalette();
    for (let at = 0; at < dataPoint.length; at += 4) {
      const radius = dataPoint[at + 3] * BBOX_RADIUS_FACTOR;
      this._bbox.addSphere(dataPoint[at], dataPoint[at + 1], dataPoint[at + 2], radius);
    }
    this.add(
      new TgdPainterPointsCloud(context, {
        name: "SomaCloud",
        dataPoint,
        dataUV,
        texture: this.texture,
        // Depth is written, unlike the region-scale soma cloud that drops it for fill rate:
        // here a soma stands among neurites a few micrometres thick, and which of the two
        // owns a pixel is plain to see.
        fragCode: TgdPainterPointsCloud.fragCodeSphere({
          depthPrecision: "high",
          enableSpecular: true,
        }),
      })
    );
  }

  /** Where these somas reach, for the camera to frame with the rest of the scene. */
  get bbox(): Readonly<TgdBoundingBox> {
    return this._bbox;
  }

  /**
   * Neuron opacity, carried by the palette's alpha.
   *
   * The sphere shader passes the sampled alpha straight through, and the manager sets alpha
   * blending around the cells while they are translucent, so this needs nothing else. Re-drawn
   * into the palette rather than the shader: a uniform would mean rebuilding the program, and
   * the palette is a canvas a few pixels wide.
   */
  get opacity(): number {
    return this._opacity;
  }
  set opacity(opacity: number) {
    if (opacity === this._opacity) return;

    this._opacity = opacity;
    this.loadPalette();
  }

  private loadPalette() {
    const { _opacity: opacity } = this;
    const colors: Array<string | TgdColor> =
      opacity >= 1
        ? [...this.palette]
        : this.palette.map((color) => TgdColor.fromString(color).alphaMul(opacity));
    this.texture.loadBitmap(tgdCanvasCreatePalette(colors));
  }

  delete(): void {
    super.delete();
    this.texture.delete();
  }
}
