import {
  type TgdContext,
  TgdFilterBlur,
  TgdMaterialFlat,
  TgdMaterialSolid,
  TgdPainter,
  TgdPainterClear,
  TgdPainterFilter,
  TgdPainterFramebufferWithAntiAliasing,
  TgdPainterGroup,
  TgdPainterSegmentsMorphing,
  TgdPainterState,
  TgdTexture2D,
  tgdCalcModulo,
  tgdCanvasCreatePalette,
} from "@tolokoban/tgd";
import type { MorphoViewerSpikeRecord } from "../../../types/public";
import type { MorphologyData } from "../../morphology-data";
import { PALETTE } from "../contants";

export class PainterSpiking extends TgdPainterGroup {
  private textureInternal: TgdTexture2D | null = null;
  private framebufferInternal: TgdPainterFramebufferWithAntiAliasing | null = null;
  private blurEffect: TgdPainter | null = null;
  private readonly palette: TgdTexture2D;
  private painterSegments: TgdPainterSegmentsMorphing | null = null;
  /**
   * Transition between two views.
   * For instance, 0.0 for 3D and 1.0 for Dendrogram.
   */
  private _mix = 0;
  private _spike: MorphoViewerSpikeRecord | undefined = undefined;
  private readonly material = new TgdMaterialSolid({
    color: [0.9, 0.6, 0.1, 1],
  });

  constructor(
    private readonly context: TgdContext,
    data: MorphologyData,
  ) {
    super({ name: "PainterSpiking" });
    this.palette = new TgdTexture2D(context).loadBitmap(tgdCanvasCreatePalette(PALETTE)).setParams({
      magFilter: "NEAREST",
      minFilter: "NEAREST",
    });
    this.painterSegments = this.createPainterSegments(context, data);
    const framebufferInternal = this.createFramebufferInternal();
    const blurEffect = this.createBlurEffect();
    this.add(framebufferInternal, blurEffect, (time) => {
      const t = tgdCalcModulo(time, 0, 2);
      const dur = 0.25;
      const tick = 0.7;
      const dist = Math.max(1 - Math.abs(t - tick) / dur, 0);
      this.power = 2 * Math.pow(dist, 3);
    });
  }

  set power(power: number) {
    const { material } = this;
    material.color.x = 0.9 * power;
    material.color.y = 0.6 * power;
    material.color.z = 0.1 * power;
  }

  private createBlurEffect() {
    const { context, framebufferInternal, painterSegments } = this;
    if (!framebufferInternal) throw new Error("framebufferInternal is not defined!");
    if (!painterSegments) throw new Error("painterSegments is not defined!");

    const size = 8;
    const filters = new TgdPainterFilter(context, {
      filters: [...TgdFilterBlur.createPair({ size })],
      texture: framebufferInternal.textureColor0,
      flipY: true,
    });
    return new TgdPainterState(context, {
      depth: "off",
      cull: "off",
      blend: "add",
      children: [filters],
    });
  }

  private createFramebufferInternal() {
    const { context, painterSegments } = this;
    if (!painterSegments) throw new Error("painterSegments is not defined!");

    const textureInternal = (this.textureInternal = new TgdTexture2D(context).setParams({
      magFilter: "LINEAR",
      minFilter: "LINEAR",
    }));
    const clear = new TgdPainterClear(context, { depth: 1 });
    this.framebufferInternal = new TgdPainterFramebufferWithAntiAliasing(context, {
      name: "framebufferInternal",
      children: [
        new TgdPainterClear(context, { color: [0, 0, 0, 1], depth: 1 }),
        new TgdPainterState(context, {
          depth: "less",
          blend: "off",
          cull: "back",
          children: [clear, painterSegments],
        }),
      ],
      depthBuffer: true,
      viewportMatchingScale: 0.25,
      textureColor0: textureInternal,
    });
    return this.framebufferInternal;
  }

  private createPainterSegments(context: TgdContext, data: MorphologyData) {
    const { dataset3D, datasetDendrogram } = data;
    const painterSegments = (this.painterSegments = new TgdPainterSegmentsMorphing(context, {
      roundness: 4,
      minRadius: 1,
      radiusMultiplier: 1.5,
      datasetsPairs: [[dataset3D, datasetDendrogram]],
      material: this.material,
    }));
    painterSegments.mix = this.mix;
    console.log("🐞 [spiking@105] data =", data); // @FIXME: Remove this line written on 2026-03-13 at 18:13
    console.log("🐞 [spiking@106] painterSegments.mix =", painterSegments.mix); // @FIXME: Remove this line written on 2026-03-13 at 18:13
    return painterSegments;
  }

  get spike() {
    return this._spike;
  }
  set spike(value: MorphoViewerSpikeRecord | undefined) {
    this._spike = value;
    this.context.paint();
  }

  get mix() {
    return this._mix;
  }

  set mix(mix: number) {
    this._mix = mix;
    if (this.painterSegments) {
      this.painterSegments.mix = mix;
    }
  }

  delete() {
    this.palette.delete();
    this.blurEffect?.delete();
    this.painterSegments?.delete();
    this.textureInternal?.delete();
    this.framebufferInternal?.delete();
  }
}
