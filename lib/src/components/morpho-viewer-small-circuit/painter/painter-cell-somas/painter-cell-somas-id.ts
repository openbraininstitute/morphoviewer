/* eslint-disable no-bitwise */
import {
  type TgdContext,
  TgdDataset,
  TgdPainter,
  TgdProgram,
  TgdShaderFragment,
  TgdShaderVertex,
  TgdVertexArray,
} from "@tolokoban/tgd";

/**
 * Where the cloud's numbering starts in the cell pick buffer.
 *
 * The buffer holds two kinds of pass: a mesh per cell drawn in full, numbered from 1 up, and
 * this cloud. Both write into the same 24 bits, so the cloud starts high enough that a decoded
 * index says on its own which pass drew the pixel — no scene reaches eight million cells.
 */
export const CLOUD_FIRST_INDEX = 1 << 23;

/**
 * `PainterCellSomas`, drawn in cell indices instead of colours.
 *
 * Its own painter rather than the somas-only viewer's: that one carries a hidden mask and
 * takes every soma's radius from a single uniform, and widening its position buffer to hold a
 * radius each would cost region scale megabytes for something only a small circuit needs.
 *
 * The position and size maths mirror `TgdPainterPointsCloud`'s vertex shader line for line,
 * `radiusMultiplier` aside — the visible cloud leaves it at 1 — and the depth is the same
 * sphere profile, so a neurite in front of a soma wins the pixel here exactly as it does on
 * screen. What it drops is everything about appearance.
 */
export class PainterCellSomasId extends TgdPainter {
  private readonly count: number;
  private readonly program: TgdProgram;
  private readonly vao: TgdVertexArray;

  constructor(
    public readonly context: TgdContext,
    /** `[x, y, z, radius]` per soma, in instance order. */
    dataPoint: Float32Array
  ) {
    super("PainterCellSomasId");
    this.count = dataPoint.length / 4;
    const instances = new TgdDataset({ attPoint: "vec4" }, { divisor: 1 });
    instances.set("attPoint", dataPoint);
    const billboards = new TgdDataset({ attPointCoord: "vec2" });
    billboards.set("attPointCoord", new Float32Array([-1, -1, +1, -1, +1, +1, -1, +1]));
    this.program = createIdProgram(context);
    this.vao = new TgdVertexArray(context.gl, this.program, [instances, billboards]);
  }

  paint() {
    const { context, program, vao } = this;
    const { gl, camera } = context;
    program.use();
    program.uniform2f("uniAspectRatio", context.aspectRatioInverse, 1);
    program.uniformMatrix4fv("uniModelViewMatrix", camera.matrixModelView);
    program.uniformMatrix4fv("uniProjectionMatrix", camera.matrixProjection);
    vao.bind();
    gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, this.count);
    vao.unbind();
  }

  delete() {
    this.program.delete();
    this.vao.delete();
  }
}

function createIdProgram(context: TgdContext): TgdProgram {
  const vert = new TgdShaderVertex({
    uniforms: {
      uniAspectRatio: "vec2",
      uniModelViewMatrix: "mat4",
      uniProjectionMatrix: "mat4",
    },
    attributes: {
      /** `[x, y, z, radius]`. */
      attPoint: "vec4",
      /** Between -1.0 and +1.0 */
      attPointCoord: "vec2",
    },
    varying: {
      varColor: "vec4",
      varPointCoord: "vec2",
      varDepth: "float",
    },
    mainCode: [
      `int id = gl_InstanceID + ${CLOUD_FIRST_INDEX};`,
      "varColor = vec4(vec3(float(id & 0xFF), float((id >> 8) & 0xFF), float((id >> 16) & 0xFF)) / 255.0, 1.0);",
      "float radius = attPoint.w;",
      "vec4 point = uniModelViewMatrix * vec4(attPoint.xyz, 1.0);",
      "gl_Position = uniProjectionMatrix * point;",
      "vec4 depth = point + vec4(0, 0, radius, 0);",
      "vec4 screenDepth = uniProjectionMatrix * depth;",
      "varDepth = (gl_Position.z - screenDepth.z) * .5;",
      "vec4 shift = point + vec4(radius, radius, 0, 0);",
      "vec4 screenShift = uniProjectionMatrix * shift;",
      "float pointSize = abs(screenShift.y - gl_Position.y);",
      "gl_Position.xy += attPointCoord * pointSize * uniAspectRatio;",
      "varPointCoord = attPointCoord;",
    ],
  }).code;

  const frag = new TgdShaderFragment({
    varying: {
      varColor: "vec4",
      varPointCoord: "vec2",
      varDepth: "float",
    },
    outputs: { FragColor: "vec4" },
    mainCode: [
      // The same circle and sphere depth as `fragCodeSphere` at high precision, unshaded.
      "float z2 = 1.0 - dot(varPointCoord, varPointCoord);",
      "if (z2 < 0.0) discard;",
      "gl_FragDepth = gl_FragCoord.z - sqrt(z2) * varDepth;",
      "FragColor = varColor;",
    ],
  }).code;

  return new TgdProgram(context.gl, { vert, frag });
}
