import {
  TgdDataset,
  TgdPainter,
  TgdPainterPointsCloud,
  TgdProgram,
  TgdShaderFragment,
  TgdShaderVertex,
  TgdVertexArray,
} from "@tolokoban/tgd";

import type { TgdContext, TgdTexture2D } from "@tolokoban/tgd";

/**
 * Position of the glow dataset in the VAO, which is how {@link TgdVertexArray}
 * addresses its buffers.
 */
const GLOW_BUFFER_INDEX = 1;

/** Colour a fully-glowing soma adds on top of whatever it is painted. */
const DEFAULT_GLOW_COLOR: [number, number, number] = [1, 0.85, 0.4];

/**
 * How much wider a fully-glowing soma is drawn, as a fraction of its radius.
 *
 * Brightness alone carries a spike on a handful of cells and loses it on a
 * million: past a few hundred thousand somas each one covers about a pixel, and
 * a pixel that changes colour is far harder to catch than one that appears.
 */
const DEFAULT_GLOW_SWELL = 0.6;

export interface PainterSomaCloudOptions {
  /** `[x, y, z, radius]` per soma; radius is scaled by `radiusMultiplier`. */
  dataPoint: Float32Array;
  /** `[u, v]` per soma: `u` picks the palette column, `v` carries occlusion. */
  dataUV: Float32Array;
  /** Palette sampled at `dataUV`. Owned by the caller, never deleted here. */
  texture: TgdTexture2D;
  radiusMultiplier?: number;
  glowColor?: [number, number, number];
  glowSwell?: number;
}

/**
 * A soma point cloud whose cells can be lit individually, one float each.
 *
 * `TgdPainterPointsCloud` draws exactly this and is what the viewer used before
 * spikes, but its two instance attributes are both spoken for — `attPoint` is
 * position and radius, `attUV` is palette column and ambient occlusion — and
 * its vertex shader is fixed, so there is nowhere to put a per-cell intensity.
 * The alternative was to widen the palette to `colours × brightness levels` and
 * rewrite the colour column every frame, which works, but writes into the
 * interleaved buffer the positions live in: six floats of traffic per soma to
 * move one. Here the glow is its own tightly-packed buffer, so a frame uploads
 * four bytes per soma, contiguously, and touches nothing else.
 *
 * Everything else is tgd's points cloud, kept deliberately close to it so the
 * two can be read side by side.
 */
export class PainterSomaCloud extends TgdPainter {
  public readonly count: number;
  public radiusMultiplier: number;

  private readonly texture: TgdTexture2D;
  private readonly glowColor: [number, number, number];
  private readonly glowSwell: number;
  private readonly program: TgdProgram;
  private readonly vao: TgdVertexArray;

  constructor(
    public readonly context: TgdContext,
    options: PainterSomaCloudOptions
  ) {
    super("PainterSomaCloud");
    this.texture = options.texture;
    this.radiusMultiplier = options.radiusMultiplier ?? 1;
    this.glowColor = options.glowColor ?? DEFAULT_GLOW_COLOR;
    this.glowSwell = options.glowSwell ?? DEFAULT_GLOW_SWELL;
    this.count = options.dataUV.length >> 1;

    const instances = new TgdDataset({ attPoint: "vec4", attUV: "vec2" }, { divisor: 1 });
    instances.set("attPoint", options.dataPoint);
    instances.set("attUV", options.dataUV);

    // Built straight from a sized ArrayBuffer rather than through
    // `TgdDataset.set`, which copies one soma at a time — a loop worth avoiding
    // at region scale for what is only a buffer of zeros.
    const glow = new TgdDataset(
      { attGlow: "float" },
      {
        divisor: 1,
        usage: "DYNAMIC_DRAW",
        data: new ArrayBuffer(this.count * Float32Array.BYTES_PER_ELEMENT),
      }
    );

    const billboards = new TgdDataset({ attPointCoord: "vec2" });
    billboards.set("attPointCoord", new Float32Array([-1, -1, +1, -1, +1, +1, -1, +1]));

    this.program = createProgram(context, this.glowColor, this.glowSwell);
    this.vao = new TgdVertexArray(context.gl, this.program, [instances, glow, billboards]);
  }

  /**
   * Push this frame's brightness for every soma.
   *
   * Expects the array {@link SpikingCircuit} owns, whose length is the cell
   * count and whose contents are rewritten in place each frame — so this is a
   * straight copy to the GPU with no per-soma work on either side.
   */
  setGlow(glow: Readonly<Float32Array>) {
    if (glow.length !== this.count) return;

    const buffer = this.vao.getBuffer(GLOW_BUFFER_INDEX);
    if (!buffer) return;

    const { gl } = this.context;
    buffer.bind();
    // `bufferSubData`, not `bufferData`: the allocation never changes size, and
    // reallocating it sixty times a second is how you get a stuttering replay.
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, glow as Float32Array);
  }

  paint() {
    const { context, program, vao, texture, count, radiusMultiplier } = this;
    const { gl, camera } = context;
    program.use();
    texture.activate(0, program, "uniTexture");
    program.uniform1f("uniRadiusMultiplier", radiusMultiplier);
    program.uniform2f("uniAspectRatio", context.aspectRatioInverse, 1);
    program.uniformMatrix4fv("uniModelViewMatrix", camera.matrixModelView);
    program.uniformMatrix4fv("uniProjectionMatrix", camera.matrixProjection);
    vao.bind();
    gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, count);
    vao.unbind();
  }

  delete() {
    this.program.delete();
    this.vao.delete();
  }
}

function createProgram(
  context: TgdContext,
  glowColor: [number, number, number],
  glowSwell: number
): TgdProgram {
  const [red, green, blue] = glowColor;
  const vert = new TgdShaderVertex({
    uniforms: {
      uniTexture: "sampler2D",
      uniAspectRatio: "vec2",
      uniRadiusMultiplier: "float",
      uniModelViewMatrix: "mat4",
      uniProjectionMatrix: "mat4",
    },
    attributes: {
      attPoint: "vec4",
      attUV: "vec2",
      attGlow: "float",
      /** Between -1.0 and +1.0 */
      attPointCoord: "vec2",
    },
    varying: {
      varColor: "vec4",
      varPointCoord: "vec2",
      varDepth: "float",
      varGlow: "float",
    },
    mainCode: [
      "varColor = texture(uniTexture, attUV);",
      "varGlow = attGlow;",
      // The swell is inside the radius rather than applied to the sprite
      // afterwards, so the lit sphere and the depth it writes grow together.
      `float radius = attPoint.w * uniRadiusMultiplier * (1.0 + attGlow * ${glowSwell.toFixed(6)});`,
      "vec4 point = uniModelViewMatrix * vec4(attPoint.xyz, 1.0);",
      "gl_Position = uniProjectionMatrix * point;",
      "vec4 depth = point + vec4(0, 0, radius, 0);",
      "vec4 screenDepth = uniProjectionMatrix * depth;",
      "varDepth = (gl_Position.z - screenDepth.z) * .5;",
      "vec4 shift = point + vec4(radius, radius, 0, 0);",
      "vec4 screenShift = uniProjectionMatrix * shift;",
      // tgd floors this at `uniMinSizeInPixels`, which the soma cloud has never
      // set. Dropped rather than carried at zero, since the glow swell is what
      // keeps a spiking soma visible once one covers less than a pixel.
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
      varGlow: "float",
    },
    outputs: { FragColor: "vec4" },
    functions: {
      render: [
        "vec4 render(vec4 color) {",
        TgdPainterPointsCloud.fragCodeSphere({
          enableSpecular: true,
          specularExponent: 50,
          specularIntensity: 0.33,
          shadowIntensity: 0.5,
          shadowThickness: 1,
          light: 1,
        }),
        "}",
      ],
    },
    mainCode: [
      "vec4 lit = render(varColor);",
      // Added after the shading, so a spike reads as the cell emitting light
      // rather than as one lit more brightly from the same direction.
      `vec3 glow = varGlow * vec3(${red.toFixed(6)}, ${green.toFixed(6)}, ${blue.toFixed(6)});`,
      // Translucent circuits fade the alpha of every soma, which would fade the
      // spike with it. A cell at full brightness is opaque whatever the rest
      // of the circuit is set to, so a replay stays legible through it.
      "FragColor = vec4(lit.rgb + glow, mix(lit.a, 1.0, varGlow));",
    ],
  }).code;

  return new TgdProgram(context.gl, { vert, frag });
}
