import {
  type TgdContext,
  TgdPainterGroup,
  TgdPainterPointsCloud,
  TgdTexture2D,
  tgdCanvasCreatePalette,
} from "@tolokoban/tgd";

import { buildMarkerPalette } from "./palette";

/** One selected morphology location, already placed in world coordinates. */
export interface LocationMarker {
  x: number;
  y: number;
  z: number;
  /** Marker colour. Falls back to the painter's own when a marker does not name one. */
  color?: string;
}

/**
 * Round markers for the selected morphology locations.
 *
 * Not {@link PainterSynapses}: that one draws square quads, which is invisible at synapse size
 * but obvious at marker size, and hosts drive synapses from their own data so sharing a
 * painter would make each overwrite the other.
 */
export class PainterLocationMarkers extends TgdPainterGroup {
  private readonly texture: TgdTexture2D;
  private painter: TgdPainterPointsCloud | null = null;
  private _markers: LocationMarker[] = [];
  private _color = "#ef9f27";
  private _radius = 3;
  private _minRadiusInPixels = 6;

  constructor(public readonly context: TgdContext) {
    super({ name: "PainterLocationMarkers" });
    this.texture = new TgdTexture2D(context, {
      params: { magFilter: "NEAREST", minFilter: "NEAREST" },
    });
  }

  get markers(): LocationMarker[] {
    return this._markers;
  }
  set markers(markers: LocationMarker[]) {
    this._markers = markers;
    this.rebuild();
  }

  get color(): string {
    return this._color;
  }
  set color(color: string) {
    if (this._color === color) return;

    this._color = color;
    this.rebuild();
  }

  /** World-space radius, floored at {@link minRadiusInPixels} so it survives zooming out. */
  get radius(): number {
    return this._radius;
  }
  set radius(radius: number) {
    if (this._radius === radius) return;

    this._radius = radius;
    if (this.painter) this.painter.radiusMultiplier = radius;
    this.context.paint();
  }

  get minRadiusInPixels(): number {
    return this._minRadiusInPixels;
  }
  set minRadiusInPixels(minRadiusInPixels: number) {
    if (this._minRadiusInPixels === minRadiusInPixels) return;

    this._minRadiusInPixels = minRadiusInPixels;
    if (this.painter) this.painter.minSizeInPixels = minRadiusInPixels;
    this.context.paint();
  }

  private rebuild() {
    this.removeAll();
    this.painter = null;
    const { _markers: markers } = this;
    if (markers.length > 0) {
      const { palette, slots } = buildMarkerPalette(markers, this._color);
      this.texture.loadBitmap(tgdCanvasCreatePalette(palette));
      const attXYZR: number[] = [];
      const attUV: number[] = [];
      markers.forEach(({ x, y, z }, index) => {
        attXYZR.push(x, y, z, 1);
        attUV.push((slots[index] + 0.5) / palette.length, 0.5);
      });
      const painter = new TgdPainterPointsCloud(this.context, {
        dataPoint: new Float32Array(attXYZR),
        dataUV: new Float32Array(attUV),
        texture: this.texture,
        radiusMultiplier: this._radius,
        minSizeInPixels: this._minRadiusInPixels,
        // Without this the quad fills corner to corner and reads as a square.
        fragCode: TgdPainterPointsCloud.fragCodeSphere({ depthPrecision: "none" }),
      });
      this.painter = painter;
      this.add(painter);
    }
    this.context.paint();
  }

  delete(): void {
    super.delete();
    this.texture.delete();
  }
}
