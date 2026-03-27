import {
  TgdColor,
  TgdContext,
  TgdDataset,
  TgdEvent,
  TgdPainterFramebuffer,
  TgdPainterProgram,
  TgdTexture2D,
  TgdUniformBufferObject,
} from "@tolokoban/tgd";
import { MorphoViewerSpikeRecord } from "@/components/morpho-viewer-simul/types/public";

export interface FramebufferTicksOptions {
  texture: TgdTexture2D;
}

export class FramebufferTicks extends TgdPainterFramebuffer {
  public readonly eventNeedsRefresh = new TgdEvent();

  private readonly ticks: PainterTicks;

  constructor(
    public readonly context: TgdContext,
    { texture }: FramebufferTicksOptions,
  ) {
    const ticks = new PainterTicks(context);
    super(context, {
      textureColor0: texture,
      fixedSize: true,
      children: [ticks],
    });
    this.ticks = ticks;
  }

  get spike(): MorphoViewerSpikeRecord | undefined {
    return this.ticks.spike;
  }
  set spike(spike: MorphoViewerSpikeRecord | undefined) {
    if (this.ticks.spike === spike) return;

    this.ticks.spike = spike;
  }
}

/**
 * Vertical lines that mark the spikes on the timeline.
 */
export class PainterTicks extends TgdPainterProgram {
  private _spike: MorphoViewerSpikeRecord | undefined = undefined;
  private readonly uniformBlock: TgdUniformBufferObject<
    "uniSize" | "uniScale" | "uniPower" | "uniColor"
  >;
  private readonly dataset: TgdDataset;

  constructor(public readonly context: TgdContext) {
    const datasetTicks = new TgdDataset(
      {
        attShift: "float",
      },
      {
        divisor: 1,
        usage: "DYNAMIC_DRAW",
      },
    );
    const uniformBlock = new TgdUniformBufferObject(context, {
      uniforms: {
        uniSize: "float",
        uniScale: "vec2",
        uniPower: "float",
        uniColor: "vec4",
      },
    });
    super(context, {
      drawMode: "TRIANGLE_STRIP",
      uniforms: {
        uniformBlock,
      },
      state: {
        depth: "off",
        cull: "off",
        blend: "add",
      },
      varying: {
        varCorner: "vec2",
      },
      dataset: [
        datasetTicks,
        {
          attribs: {
            attCorner: {
              type: "vec2",
              data: new Float32Array([+1, -1, +1, +1, -1, -1, -1, +1]),
            },
          },
        },
      ],
      vert: {
        mainCode: [
          "varCorner = attCorner;",
          "gl_Position = vec4(",
          [
            "attShift * uniScale.x + uniSize * attCorner.x,",
            "uniScale.y * attCorner.y,",
            "0,",
            "1",
          ],
          ");",
        ],
      },
      frag: {
        mainCode: [
          "float x = abs(varCorner.x);",
          "float y = abs(varCorner.y);",
          "float dx = max(1.0 - pow(x, 0.125), 0.0);",
          "float dy = max(1.0 - pow(y, 1.0), 0.0);",
          "float strength = 2.0 * dx * dy;",
          "FragColor = vec4(uniColor.rgb * strength, 1.0);",
        ],
      },
      onEnter: () => {
        const radius = 32;
        const { width, height } = context;
        uniformBlock.values.uniSize = radius / width;
        uniformBlock.values.uniScale = new Float32Array([
          (width - height) / width,
          (height - 4) / height,
        ]);
        uniformBlock.values.uniPower = 1000 / (width - height);
      },
    });
    this.uniformBlock = uniformBlock;
    this.dataset = datasetTicks;
  }

  get spike(): MorphoViewerSpikeRecord | undefined {
    return this._spike;
  }
  set spike(spike: MorphoViewerSpikeRecord | undefined) {
    if (this._spike === spike) return;

    this._spike = spike;
    if (!spike) return;

    const squash = (v: number) => 0.2 + v * 0.8;
    const color = TgdColor.fromString(spike.color);
    color.R = squash(color.R);
    color.G = squash(color.G);
    color.B = squash(color.B);
    this.uniformBlock.values.uniColor = color.toVec4();
    const { dataset } = this;
    const inverseSize = 1 / (spike.timeMaxInSeconds - spike.timeMinInSeconds);
    const data = spike.spikesInSeconds.map(
      (t) => 2 * (t - spike.timeMinInSeconds) * inverseSize - 1,
    );
    this.setAttributeValues(dataset, "attShift", new Float32Array(data));
    this.context.paint();
  }

  paint(time: number, delta: number): void {
    super.paint(time, delta);
  }
}
