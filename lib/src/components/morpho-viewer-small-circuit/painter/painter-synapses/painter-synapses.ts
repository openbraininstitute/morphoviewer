import {
  TgdContext,
  TgdPainterGroup,
  TgdPainterPointsCloud,
  TgdTexture2D,
  tgdCanvasCreatePalette,
} from "@tolokoban/tgd";

export class PainterSynapses extends TgdPainterGroup {
  private readonly texture: TgdTexture2D;
  private _synapses: Array<{ coordinates: number[] | Float32Array; color: string }> = [];
  private painter: TgdPainterPointsCloud | null = null;
  private _radius = 5;
  private _minRadiusInPixels = 4;

  constructor(public readonly context: TgdContext) {
    super({ name: "PainterSynapses" });
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

  get synapses(): Array<{ coordinates: number[] | Float32Array; color: string }> {
    return this._synapses;
  }
  set synapses(synapses: Array<{ coordinates: number[] | Float32Array; color: string }>) {
    if (this._synapses === synapses) return;

    this._synapses = synapses;
    this.removeAll();
    if (synapses.length > 0) {
      this.texture.loadBitmap(tgdCanvasCreatePalette(synapses.map((synapse) => synapse.color)));
      const attXYZR: number[] = [];
      const attUV: number[] = [];
      for (let indexGroup = 0; indexGroup < synapses.length; indexGroup++) {
        const group = synapses[indexGroup];
        const u = (indexGroup + 0.5) / synapses.length;
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
