import {
  type TgdContext,
  TgdPainterGroup,
  TgdPainterPointsCloud,
  TgdTexture2D,
  tgdCanvasCreatePalette,
} from "@tolokoban/tgd";

import type { MorphoViewerWorldOverlay } from "../components/types";

/**
 * Multi-colour world-space point overlays (electrodes, markers, …).
 * Synapses use {@link PainterSynapses} instead — keep the two APIs separate.
 */
export class PainterWorldOverlays extends TgdPainterGroup {
  private readonly texture: TgdTexture2D;
  private _overlays: MorphoViewerWorldOverlay[] = [];
  private painter: TgdPainterPointsCloud | null = null;
  private _radius = 5;
  private _minRadiusInPixels = 4;

  constructor(public readonly context: TgdContext) {
    super({ name: "PainterWorldOverlays" });
    this.texture = new TgdTexture2D(context, {
      params: {
        magFilter: "NEAREST",
        minFilter: "NEAREST",
      },
    });
  }

  get radius(): number {
    return this._radius;
  }
  set radius(radius: number) {
    if (this._radius === radius) return;

    this._radius = radius;
    const { painter } = this;
    if (painter) {
      painter.radiusMultiplier = radius;
      this.context.paint();
    }
  }

  get minRadiusInPixels(): number {
    return this._minRadiusInPixels;
  }
  set minRadiusInPixels(minRadiusInPixels: number) {
    if (this._minRadiusInPixels === minRadiusInPixels) return;

    this._minRadiusInPixels = minRadiusInPixels;
    const { painter } = this;
    if (painter) {
      painter.minSizeInPixels = minRadiusInPixels;
      this.context.paint();
    }
  }

  get overlays(): MorphoViewerWorldOverlay[] {
    return this._overlays;
  }
  set overlays(overlays: MorphoViewerWorldOverlay[]) {
    if (sameOverlayContent(this._overlays, overlays)) {
      this._overlays = overlays;
      return;
    }

    this._overlays = overlays;
    this.removeAll();
    this.painter = null;
    if (overlays.length > 0) {
      this.texture.loadBitmap(tgdCanvasCreatePalette(overlays.map((overlay) => overlay.color)));
      const attXYZR: number[] = [];
      const attUV: number[] = [];
      for (let indexGroup = 0; indexGroup < overlays.length; indexGroup++) {
        const group = overlays[indexGroup];
        const u = (indexGroup + 0.5) / overlays.length;
        for (let indexCoords = 0; indexCoords < group.coordinates.length; indexCoords += 3) {
          const x = group.coordinates[indexCoords + 0];
          const y = group.coordinates[indexCoords + 1];
          const z = group.coordinates[indexCoords + 2];
          attXYZR.push(x, y, z, 1);
          attUV.push(u, 0.5);
        }
      }
      const painter = new TgdPainterPointsCloud(this.context, {
        dataPoint: new Float32Array(attXYZR),
        dataUV: new Float32Array(attUV),
        texture: this.texture,
        radiusMultiplier: this.radius,
        minSizeInPixels: this.minRadiusInPixels,
      });
      this.painter = painter;
      this.add(painter);
    }
    this.context.paint();
  }
}

function sameOverlayContent(
  a: MorphoViewerWorldOverlay[],
  b: MorphoViewerWorldOverlay[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].color !== b[i].color) return false;
    const ca = a[i].coordinates;
    const cb = b[i].coordinates;
    if (ca.length !== cb.length) return false;
    for (let j = 0; j < ca.length; j++) {
      if (ca[j] !== cb[j]) return false;
    }
  }
  return true;
}
