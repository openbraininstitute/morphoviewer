import {
  TgdContext,
  TgdPainter,
  TgdPainterProgram,
  TgdUniformBufferObject,
  TgdVec2,
} from "@tolokoban/tgd";
import { SpikingManager } from "../../../spiking-manager";
import { TIMELINE_MARGIN, TIMELINE_HEIGHT } from "@/components/morpho-viewer-simul/contants";

export class PainterCursorFill extends TgdPainter {
  private readonly uniformBlock: TgdUniformBufferObject<
    "uniProgress" | "uniBottomLeftCorner" | "uniScale" | "uniColor"
  >;
  private readonly program: TgdPainterProgram;
  private readonly scale = new TgdVec2();
  private readonly bottomLeftCorner = new TgdVec2();

  constructor(
    public readonly context: TgdContext,
    public readonly spikingManager: SpikingManager,
  ) {
    super();
    const uniformBlock = (this.uniformBlock = new TgdUniformBufferObject(context, {
      uniforms: {
        uniColor: "vec4",
        uniProgress: "float",
        uniBottomLeftCorner: "vec2",
        uniScale: "vec2",
      },
    }));
    this.program = new TgdPainterProgram(context, {
      drawMode: "TRIANGLE_STRIP",
      state: {
        depth: "off",
        cull: "off",
        blend: "add",
      },
      dataset: {
        attribs: {
          attPos: {
            type: "vec2",
            data: new Float32Array([1, -1, 1, +1, 0, -1, 0, +1]),
          },
        },
      },
      uniforms: { uniformBlock },
      varying: {
        varUV: "vec2",
      },
      vert: {
        mainCode: [
          "float x = attPos.x;",
          "float y = attPos.y;",
          "varUV = vec2(x, y);",
          "vec2 pos = vec2(x, y);",
          "gl_Position = vec4(",
          ["uniBottomLeftCorner + uniScale * pos,", "0.0,", "1.0"],
          ");",
        ],
      },
      frag: {
        mainCode: [
          "float intensity = 1.0 - pow(abs(varUV.y), .02);",
          "intensity *= 4.0;",
          "FragColor = vec4(uniColor.rgb * intensity, uniColor.a);",
        ],
      },
    });
    this.updateColor();
    spikingManager.eventSpikeChange.addListener(this.updateColor);
  }

  delete() {
    this.uniformBlock.delete();
    this.program.delete();
    this.spikingManager.eventSpikeChange.removeListener(this.updateColor);
  }

  paint(time: number, delta: number) {
    const { context, uniformBlock, program, spikingManager } = this;
    const { width, height } = context;
    const X = (x: number) => (2 * x) / width - 1;
    const Y = (y: number) => 1 - (2 * y) / height;
    const [_top, right, bottom, left] = TIMELINE_MARGIN;
    uniformBlock.values.uniProgress = spikingManager.progress;
    this.bottomLeftCorner.x = X(left);
    this.bottomLeftCorner.y = Y(height - bottom - TIMELINE_HEIGHT * 0.5);
    uniformBlock.values.uniBottomLeftCorner = this.bottomLeftCorner;
    const progress = spikingManager.progress;
    const bar = width - left - right;
    this.scale.x = (2 * (0.5 * TIMELINE_HEIGHT + progress * (bar - TIMELINE_HEIGHT))) / width;
    this.scale.y = TIMELINE_HEIGHT / height;
    uniformBlock.values.uniScale = this.scale;
    program.paint(time, delta);
  }

  private readonly updateColor = () => {
    this.uniformBlock.values.uniColor = this.spikingManager.color.toVec4();
  };
}
