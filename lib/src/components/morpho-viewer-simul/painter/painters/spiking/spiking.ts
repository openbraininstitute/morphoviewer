import {
  tgdCalcMix,
  type TgdContext,
  TgdFilterBlur,
  TgdMaterialSolid,
  TgdPainter,
  TgdPainterClear,
  TgdPainterFilter,
  TgdPainterFramebuffer,
  TgdPainterFramebufferWithAntiAliasing,
  TgdPainterGroup,
  TgdPainterSegmentsMorphing,
  TgdPainterState,
  TgdTexture2D,
} from "@tolokoban/tgd";
import type { MorphoViewerSpikeRecord } from "../../../types/public";
import type { MorphologyData } from "../../morphology-data";
import { SpikingManager } from "../../spiking-manager";
import {
  SPIKING_BLUR_SIZE,
  SPIKING_COLOR,
  SPIKING_COLOR_MIX,
  SPIKING_RADIUS_MULTIPLIER,
} from "@/components/morpho-viewer-simul/contants";

export class PainterSpiking extends TgdPainterGroup {
  private textureInternal: TgdTexture2D | null = null;
  private framebufferInternal: TgdPainterFramebufferWithAntiAliasing | null = null;
  private blurEffect: TgdPainter | null = null;
  private painterSegments: TgdPainterSegmentsMorphing | null = null;
  /**
   * Transition between two views.
   * For instance, 0.0 for 3D and 1.0 for Dendrogram.
   */
  private _mix = 0;
  private _spike: MorphoViewerSpikeRecord | undefined = undefined;
  private readonly material = new TgdMaterialSolid({
    color: [0, 0, 0, 1],
  });

  constructor(
    private readonly context: TgdContext,
    data: MorphologyData,
    private readonly spikingManager: SpikingManager,
  ) {
    super({ name: "PainterSpiking" });
    this.painterSegments = this.createPainterSegments(context, data);
    const framebufferInternal = this.createFramebufferInternal();
    const blurEffect = this.createBlurEffect();
    this.add(framebufferInternal, blurEffect);
  }

  private createBlurEffect() {
    const { context, framebufferInternal, painterSegments } = this;
    if (!framebufferInternal) throw new Error("framebufferInternal is not defined!");
    if (!painterSegments) throw new Error("painterSegments is not defined!");

    const size = SPIKING_BLUR_SIZE;
    const filters = new TgdPainterFilter(context, {
      filters: [...TgdFilterBlur.createPair({ size })],
      texture: framebufferInternal.textureColor0,
      flipY: true,
    });
    return new TgdPainterState(context, {
      name: "State for blur effect",
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
    this.framebufferInternal = new TgdPainterFramebuffer(context, {
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
      minRadius: 8,
      radiusMultiplier: SPIKING_RADIUS_MULTIPLIER,
      datasetsPairs: [[dataset3D, datasetDendrogram]],
      material: this.material,
    }));
    painterSegments.mix = this.mix;
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
    this.blurEffect?.delete();
    this.painterSegments?.delete();
    this.textureInternal?.delete();
    this.framebufferInternal?.delete();
  }

  paint(time: number, delta: number) {
    const { spikingManager } = this;
    const { R: R1, G: G1, B: B1, A } = spikingManager.color;
    const [R2, G2, B2] = SPIKING_COLOR;
    const R = tgdCalcMix(R1, R2, SPIKING_COLOR_MIX);
    const G = tgdCalcMix(G1, G2, SPIKING_COLOR_MIX);
    const B = tgdCalcMix(B1, B2, SPIKING_COLOR_MIX);
    const { color } = this.material;
    const { intensity } = spikingManager;
    color.reset(R * intensity, G * intensity, B * intensity, A);
    super.paint(time, delta);
  }
}
