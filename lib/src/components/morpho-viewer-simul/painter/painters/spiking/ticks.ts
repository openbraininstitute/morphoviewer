import {
  tgdCalcRandom,
  TgdContext,
  TgdDataset,
  TgdPainterFramebuffer,
  TgdPainterProgram,
  TgdTexture2D,
  TgdUniformBufferObject,
} from "@tolokoban/tgd";

export interface FramebufferTicksOptions {
  texture: TgdTexture2D;
}

export class FramebufferTicks extends TgdPainterFramebuffer {
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
  }
}

export class PainterTicks extends TgdPainterProgram {
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
    datasetTicks.set(
      "attShift",
      new Float32Array([-1, -0.9, -0.7, -0.2, 0.1, 0.3, 0.4, 0.6, 0.61, 0.62, +1]),
    );
    const uniformBlock = new TgdUniformBufferObject(context, {
      uniforms: {
        uniSize: "float",
        uniScale: "float",
        uniPower: "float",
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
          ["attShift * uniScale + uniSize * attCorner.x,", "attCorner.y,", "0,", "1"],
          ");",
        ],
      },
      frag: {
        mainCode: [
          "vec3 uniColor = vec3(.8, .5, .1);",
          "float x = varCorner.x;",
          "float y = varCorner.y * .25;",
          "float d = x*x + y*y;",
          "float strength = 1.0 / (256.0 * pow(d, uniPower));",
          "FragColor = vec4(uniColor * strength, 1.0);",
        ],
      },
      onEnter: () => {
        const radius = 16;
        const { width, height } = context;
        uniformBlock.values.uniSize = radius / width;
        uniformBlock.values.uniScale = (width - height) / width;
        uniformBlock.values.uniPower = 1000 / (width - height);
      },
    });
  }
}
