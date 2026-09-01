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
 * A spiking soma is drawn brighter, a little larger, and ringed.
 *
 * Cells are coloured from a palette chosen by whatever property is being
 * looked at - layer, m-type, region - so no fixed hue is safe: whatever is
 * picked here, the palette may be using it two cells away. Brightness, size
 * and an outline are the cues no palette can take, and the outline is also
 * what stops a bright soma reading as a hole in a light background.
 */
const DEFAULT_GLOW_COLOR: [number, number, number] = [1, 0.97, 0.88];
/** Multiple of its own colour a fully-glowing soma is brightened to. */
const GLOW_BOOST = 2.2;
/** How far the brightened colour then travels towards `DEFAULT_GLOW_COLOR`. */
const GLOW_WHITEN = 0.35;
/** Light added on top of the shaded sphere, in the soma's own brightened colour. */
const GLOW_EMISSION = 0.2;
/** Where the ring starts, as a fraction of the sprite's radius. */
const GLOW_RIM_START = 0.9;
/** Colour of that ring. */
const GLOW_RIM_COLOR: [number, number, number] = [0.3, 0.26, 0.2];
/** Exponent on the decay, below 1 so a spike holds its colour and then goes. */
const GLOW_BIAS = 0.4;
/**
 * How much wider a fully-glowing soma is drawn, as a fraction of its radius.
 * Past a few hundred thousand somas each covers about a pixel, and a pixel that
 * appears is far easier to catch than one that changes colour.
 */
const DEFAULT_GLOW_SWELL = 0.7;
/**
 * Alpha below which a soma is not drawn at all.
 *
 * Half a step of the palette texture's 8-bit alpha, so it catches the columns
 * left clear for hidden somas and nothing a host can reach with an opacity
 * setting, the lowest of which is a whole step.
 */
const HIDDEN_ALPHA = 0.5 / 255;

export interface PainterSomaCloudOptions {
  /**
   * `[x, y, z, radius]` per soma; radius is scaled by `radiusMultiplier`.
   *
   * Uploaded straight from the array's own `ArrayBuffer`, so it must own it:
   * a view onto a larger buffer would send the whole of it.
   */
  dataPoint: Float32Array<ArrayBuffer>;
  /** `[u, v]` per soma: `u` picks the palette column, `v` carries occlusion. */
  dataUV: Float32Array<ArrayBuffer>;
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
  /** Where these sit among the VAO's datasets, which is how they are addressed. */
  private readonly uvBufferIndex: number;
  private readonly glowBufferIndex: number;
  private glowWarned = false;

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

    // Every one of these is built straight from a sized ArrayBuffer rather than
    // through `TgdDataset.set`, which copies one soma at a time — a loop worth
    // avoiding at region scale.
    const points = new TgdDataset(
      { attPoint: "vec4" },
      { divisor: 1, data: options.dataPoint.buffer }
    );

    // Its own dataset, and dynamic, where tgd's points cloud interleaves it
    // with the positions: recolouring rewrites `u` for every soma and touches
    // nothing else, and sharing one buffer would make that six floats of
    // traffic per soma to move one — the same reason the glow sits apart.
    const uv = new TgdDataset(
      { attUV: "vec2" },
      { divisor: 1, usage: "DYNAMIC_DRAW", data: options.dataUV.buffer }
    );

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

    const datasets = [points, uv, glow, billboards];
    this.uvBufferIndex = datasets.indexOf(uv);
    this.glowBufferIndex = datasets.indexOf(glow);
    this.program = createProgram(context, this.glowColor, this.glowSwell);
    this.vao = new TgdVertexArray(context.gl, this.program, datasets);
  }

  /**
   * Push a new palette column for every soma.
   *
   * Expects the array {@link PainterCellInfos} owns and rewrites in place, so
   * this is a straight copy to the GPU — and the occlusion it carries in `v`
   * rides along untouched, which is the point: occlusion depends on the
   * positions alone, and a recolour does not move a soma.
   */
  setUV(dataUV: Readonly<Float32Array>) {
    const buffer = this.vao.getBuffer(this.uvBufferIndex);
    if (!buffer) return;

    const { gl } = this.context;
    buffer.bind();
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, dataUV as Float32Array);
  }

  /**
   * Push this frame's brightness for every soma.
   *
   * Expects the array {@link SpikingCircuit} owns, whose length is the cell
   * count and whose contents are rewritten in place each frame — so this is a
   * straight copy to the GPU with no per-soma work on either side.
   */
  setGlow(glow: Readonly<Float32Array>) {
    const buffer = this.vao.getBuffer(this.glowBufferIndex);
    if (!buffer || glow.length !== this.count) {
      // Said once, not sixty times a second. Saying nothing was worse: the
      // replay simply never appears, with nothing anywhere to explain it.
      if (!this.glowWarned) {
        this.glowWarned = true;
        console.warn(
          "PainterSomaCloud: no spike will be visible.",
          buffer
            ? `Expected ${this.count} intensities, one per soma, but got ${glow.length}.`
            : "The glow buffer is missing from the vertex array."
        );
      }
      return;
    }

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
      varGlow: "float",
    },
    mainCode: [
      "varColor = texture(uniTexture, attUV);",
      // A palette column left clear is a soma the host is not drawing. Sending
      // it outside the clip volume here costs no fragments at all, where
      // letting it blend away would still shade a sprite — and the glow below
      // forces alpha back to 1 as a soma spikes, so blending away is not even
      // reliable. `attUV` is per instance, so all four corners of the sprite
      // agree and the whole billboard is clipped rather than half of it.
      `if (varColor.a < ${HIDDEN_ALPHA.toFixed(8)}) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }`,
      // Shaped once here: a sprite is one vertex and many fragments, and the
      // swell below wants the same value the colour fades on.
      `float glow = pow(attGlow, ${GLOW_BIAS.toFixed(6)});`,
      "varGlow = glow;",
      // The swell is inside the radius rather than applied to the sprite
      // afterwards, so the lit sphere grows with it rather than being scaled
      // up around a sphere of the old size.
      `float radius = attPoint.w * uniRadiusMultiplier * (1.0 + glow * ${glowSwell.toFixed(6)});`,
      "vec4 point = uniModelViewMatrix * vec4(attPoint.xyz, 1.0);",
      "gl_Position = uniProjectionMatrix * point;",
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
      varGlow: "float",
    },
    outputs: { FragColor: "vec4" },
    functions: {
      render: ["vec4 render(vec4 color) {", sphereShadingWithoutDepthWrite(), "}"],
    },
    mainCode: [
      `vec3 glowColor = vec3(${red.toFixed(6)}, ${green.toFixed(6)}, ${blue.toFixed(6)});`,
      `float rim = varGlow * smoothstep(${GLOW_RIM_START.toFixed(6)}, 1.0, length(varPointCoord));`,
      // Built into the colour the sphere is shaded from, not added to the
      // shaded result: adding clips every channel at full brightness and takes
      // the specular, the shadow and the sphere's own falloff with it.
      `vec3 hotAlbedo = mix(min(varColor.rgb * ${GLOW_BOOST.toFixed(6)}, vec3(1.0)), glowColor, ${GLOW_WHITEN.toFixed(6)});`,
      "vec3 albedo = mix(varColor.rgb, hotAlbedo, varGlow);",
      "vec4 lit = render(vec4(albedo, varColor.a));",
      `vec3 hot = lit.rgb + varGlow * ${GLOW_EMISSION.toFixed(6)} * albedo;`,
      `vec3 rimColor = vec3(${GLOW_RIM_COLOR.map((c) => c.toFixed(6)).join(", ")});`,
      // Translucent circuits fade the alpha of every soma, which would fade the
      // spike with it. A cell at full brightness is opaque whatever the rest
      // of the circuit is set to, so a replay stays legible through it.
      "FragColor = vec4(mix(hot, rimColor, rim), mix(lit.a, 1.0, varGlow));",
    ],
  }).code;

  return new TgdProgram(context.gl, { vert, frag });
}

/**
 * tgd's sphere shading, with the one statement a soma cloud cannot afford.
 *
 * A fragment shader that writes `gl_FragDepth` cannot be early-Z rejected, so
 * every sprite behind another still runs in full — and at region scale the
 * somas overdraw each other many times over, leaving the frame entirely
 * fill-rate bound: measured at 4.7M somas, 177ms a frame with the write
 * against 25ms without it. What it buys is that two overlapping somas sort by
 * sphere surface rather than by sprite centre, which is not discernible where
 * a soma covers about a pixel.
 *
 * `depthPrecision` will not separate the two, because no setting of it is the
 * half wanted: `"high"` alone emits the `sqrt` that turns the squared height
 * into the height, `"none"` alone drops the write, and `"low"` sits between
 * them dropping the `sqrt` and keeping the write — the wrong half of each.
 * And the `sqrt` cannot go: the lighting reads that same value, and squared it
 * peaks at 0.93 rather than 1.0 where the light meets the sphere, which
 * through `pow(len, 50)` is a highlight at a twentieth of its intensity, so
 * the somas come out flat. So ask for `"high"` and drop the statement. Matching on `gl_FragDepth` is
 * stable: it is the GLSL builtin, the only way a shader can write its own
 * depth, and if tgd ever stops writing it this filter simply finds nothing.
 */
function sphereShadingWithoutDepthWrite(): string[] {
  const shading = TgdPainterPointsCloud.fragCodeSphere({
    enableSpecular: true,
    specularExponent: 50,
    specularIntensity: 0.33,
    shadowIntensity: 0.5,
    shadowThickness: 1,
    light: 1,
    depthPrecision: "high",
  });
  // tgd types shader code as a bloc that may nest; this one is a flat list of
  // statements, some of them empty where an option turned a line off.
  const statements = Array.isArray(shading) ? shading : [shading];
  const kept = statements.filter(
    (statement): statement is string =>
      typeof statement === "string" && !statement.includes("gl_FragDepth")
  );
  // Say so rather than quietly render seven times slower. Finding nothing to
  // strip is not the safe outcome the filter's shape suggests: it means a tgd
  // release reformatted the statement, early-Z is off again, and the only
  // symptom is 177ms frames that no test without a GL context can see.
  if (kept.length === statements.length) {
    console.error(
      "PainterSomaCloud: no gl_FragDepth write found in tgd's fragCodeSphere — the soma cloud is now fill-rate bound. Check whether tgd gained an option to drop it."
    );
  }
  return kept;
}
