import {
  TgdContext,
  TgdDataset,
  TgdPainter,
  TgdPainterClear,
  TgdPainterState,
  TgdProgram,
  TgdShaderFragment,
  TgdShaderVertex,
  TgdVertexArray,
} from "@tolokoban/tgd";

import { decodePickColor, glslEncodePickColor, spiralPixelOffsets } from "@/morphology-picking";

/**
 * Resolve a click on the soma cloud to the index of the soma under it.
 *
 * Same idea as the small-circuit `OffscreenPainter` — draw every cell into a
 * hidden buffer with its index encoded as a colour, read one pixel back — with
 * one structural difference: that buffer repaints on every frame of the main
 * view, while this one paints only when asked. The point cloud is the viewer
 * that goes to millions of instances, and doubling its every frame to keep a
 * buffer current for a click that may never come is the wrong trade. The cost
 * of painting on demand instead is one frame of latency per click.
 *
 * The buffer lives on its own context, so it also carries its own copy of the
 * positions. That is the price of the second context (GL buffers do not cross
 * contexts), which is why the picker is only built once a click listener
 * exists, and lazily at that.
 */
export class SomaPicker {
  private readonly offscreenCanvas = new OffscreenCanvas(1, 1);
  private readonly context: TgdContext;
  private readonly painter: PainterSomaCloudId;
  private isDeleted = false;

  constructor(
    private readonly onscreenContext: TgdContext,
    /** `[x, y, z]` per soma, in scene order. */
    positions: Float32Array
  ) {
    // `preserveDrawingBuffer` because the pixel is read via `execAfterNextPaint`,
    // and nothing promises that runs before the browser composites the frame.
    const context = new TgdContext(this.offscreenCanvas, {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: false,
      depth: true,
      name: "SomaPicker",
    });
    this.context = context;
    const painter = new PainterSomaCloudId(context, { positions });
    this.painter = painter;
    context.add(
      new TgdPainterClear(context, { color: [0, 0, 0, 1], depth: 1 }),
      new TgdPainterState(context, { depth: "less", children: [painter] })
    );
  }

  /**
   * Which somas are not on screen, so the picker does not answer with them.
   *
   * @see hiddenSomaMask
   */
  setHidden(hidden: Readonly<Float32Array> | null) {
    if (this.isDeleted) return;

    this.painter.setHidden(hidden);
  }

  /**
   * The index of the soma at (or within `searchRadiusInPixels` of) the given
   * clip-space point, or `null` for a miss.
   *
   * `radiusMultiplier` is the on-screen `somaRadius`, taken per pick rather
   * than at construction so the settings slider never leaves the two out of
   * step.
   */
  pick(
    xClip: number,
    yClip: number,
    radiusMultiplier: number,
    searchRadiusInPixels: number
  ): Promise<number | null> {
    if (this.isDeleted) return Promise.resolve(null);

    const { context, onscreenContext } = this;
    const { canvas } = onscreenContext;
    this.offscreenCanvas.width = Math.max(1, canvas.width);
    this.offscreenCanvas.height = Math.max(1, canvas.height);
    // The camera object is shared, not copied, so the pick sees exactly the
    // orbit/zoom the click was aimed with.
    context.camera = onscreenContext.camera;
    this.painter.radiusMultiplier = radiusMultiplier;
    return new Promise((resolve) => {
      context.execAfterNextPaint(() => {
        resolve(this.isDeleted ? null : this.readIndexNear(xClip, yClip, searchRadiusInPixels));
      });
      context.paint();
    });
  }

  /**
   * Probe outward from the click, nearest pixel first.
   *
   * At region scale a soma covers about a pixel, so requiring the exact one
   * would make clicking a matter of luck — the same reasoning as the
   * small-circuit `getItemNear`, which this mirrors. The whole search square
   * comes back in one `readPixels`: every readback is a CPU–GPU sync point,
   * and a miss would otherwise pay one per spiral step. Pixels outside the
   * buffer stay zero, which decodes as a miss.
   */
  private readIndexNear(
    xClip: number,
    yClip: number,
    radiusInPixels: number
  ): number | null {
    const { gl } = this.context;
    const side = radiusInPixels * 2 + 1;
    const pixels = new Uint8Array(side * side * 4);
    // The pointer arrives in clip space; pixel coordinates computed the way
    // `TgdContext.readPixel` computes them, so a pick lands on the same pixel.
    const centerX = Math.round(0.5 * (xClip + 1) * gl.drawingBufferWidth);
    const centerY = Math.round(0.5 * (yClip + 1) * gl.drawingBufferHeight);
    gl.readPixels(
      centerX - radiusInPixels,
      centerY - radiusInPixels,
      side,
      side,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels
    );
    for (const [dx, dy] of spiralPixelOffsets(radiusInPixels)) {
      const at = ((dy + radiusInPixels) * side + (dx + radiusInPixels)) * 4;
      // The shader numbers from 1, so that the cleared buffer reads as a miss.
      const id = decodePickColor(pixels.subarray(at, at + 4));
      if (id !== null) return id - 1;
    }
    return null;
  }

  delete() {
    this.isDeleted = true;
    this.context.delete();
  }
}

/**
 * The array's own `ArrayBuffer`, copied first if it does not own one.
 *
 * Uploading `.buffer` sends the whole of it, so a `positions` prop that is a view onto a
 * larger buffer — the host's to build however it likes — would otherwise send its neighbours
 * too. The copy is one `slice`, against the per-soma loop it is here to avoid, and the common
 * case (a whole array) does not pay it.
 */
function ownBuffer(positions: Float32Array): ArrayBuffer {
  const ownsBuffer =
    positions.byteOffset === 0 && positions.buffer.byteLength === positions.byteLength;
  return ownsBuffer ? (positions.buffer as ArrayBuffer) : positions.slice().buffer;
}

interface PainterSomaCloudIdOptions {
  /** `[x, y, z]` per soma, in scene order. */
  positions: Float32Array;
}

/**
 * `PainterSomaCloud`'s silhouette, painted in soma indices instead of colours.
 *
 * The position and size maths mirror the visible painter line for line — with
 * the radius simplified to the multiplier alone, since every `attPoint.w`
 * there is 1 — so a pick lands wherever the eye saw the soma. Depth keeps the
 * sphere profile the visible cloud once wrote; that cloud now leaves
 * `gl_FragDepth` alone for fill rate, so where two somas overlap, pick and
 * eye can disagree by up to a radius — not discernible where a soma covers
 * about a pixel. What it deliberately
 * drops is everything about appearance (occlusion, glow, and the colours
 * themselves); the one mismatch that leaves is the glow swell, so a spiking
 * soma's pick target is up to 70% smaller than its flash. The search spiral
 * covers that.
 *
 * The exception is {@link setHidden}: a soma the palette does not draw must
 * not be pickable either, and that is not something a silhouette can work out
 * for itself.
 */
class PainterSomaCloudId extends TgdPainter {
  public radiusMultiplier = 1;

  private readonly count: number;
  private readonly program: TgdProgram;
  private readonly vao: TgdVertexArray;
  /** Where the hidden flags sit among the VAO's datasets. */
  private readonly hiddenBufferIndex: number;
  /** Whether anything is hidden, so clearing an empty mask uploads nothing. */
  private hasHidden = false;

  constructor(
    public readonly context: TgdContext,
    options: PainterSomaCloudIdOptions
  ) {
    super("PainterSomaCloudId");
    this.count = options.positions.length / 3;

    // Handed the buffer whole rather than through `TgdDataset.set`, which copies one soma at a
    // time — a `subarray` and a 12-byte `set` each, so a region-scale cloud is millions of
    // temporary views built synchronously on the first click. The `hidden` dataset below and
    // every dataset in `PainterSomaCloud` already take this path.
    const instances = new TgdDataset(
      { attPoint: "vec3" },
      { divisor: 1, data: ownBuffer(options.positions) }
    );

    // Starts at zero — everything pickable — and stays that way unless a host
    // hides something, which most never do.
    const hidden = new TgdDataset(
      { attHidden: "float" },
      {
        divisor: 1,
        usage: "DYNAMIC_DRAW",
        data: new ArrayBuffer(this.count * Float32Array.BYTES_PER_ELEMENT),
      }
    );

    const billboards = new TgdDataset({ attPointCoord: "vec2" });
    billboards.set("attPointCoord", new Float32Array([-1, -1, +1, -1, +1, +1, -1, +1]));

    const datasets = [instances, hidden, billboards];
    this.hiddenBufferIndex = datasets.indexOf(hidden);
    this.program = createIdProgram(context);
    this.vao = new TgdVertexArray(context.gl, this.program, datasets);
  }

  /**
   * Push which somas are not drawn, `null` for none of them.
   *
   * Rare enough — a population toggled, not a frame of replay — that it
   * uploads the whole mask rather than tracking what changed.
   */
  setHidden(hidden: Readonly<Float32Array> | null) {
    if (!hidden && !this.hasHidden) return;
    if (hidden && hidden.length !== this.count) return;

    const buffer = this.vao.getBuffer(this.hiddenBufferIndex);
    if (!buffer) return;

    const { gl } = this.context;
    buffer.bind();
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, hidden ?? new Float32Array(this.count));
    this.hasHidden = hidden !== null;
  }

  paint() {
    const { context, program, vao, count, radiusMultiplier } = this;
    const { gl, camera } = context;
    program.use();
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

function createIdProgram(context: TgdContext): TgdProgram {
  const vert = new TgdShaderVertex({
    uniforms: {
      uniAspectRatio: "vec2",
      uniRadiusMultiplier: "float",
      uniModelViewMatrix: "mat4",
      uniProjectionMatrix: "mat4",
    },
    attributes: {
      attPoint: "vec3",
      /** Non-zero for a soma the palette does not draw. */
      attHidden: "float",
      /** Between -1.0 and +1.0 */
      attPointCoord: "vec2",
    },
    varying: {
      varColor: "vec4",
      varPointCoord: "vec2",
      varDepth: "float",
    },
    mainCode: [
      // Out of the clip volume, exactly as the visible cloud culls it, so the
      // buffer holds what the eye sees. Nothing behind the click can reach the
      // pick otherwise: the ID buffer is depth-tested, so a hidden soma in
      // front would win and the visible one behind it would never be drawn.
      "if (attHidden > 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }",
      ...glslEncodePickColor("gl_InstanceID + 1"),
      "float radius = uniRadiusMultiplier;",
      "vec4 point = uniModelViewMatrix * vec4(attPoint, 1.0);",
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
      // The same circle and sphere depth as `fragCodeSphere`, without the shading.
      "float z2 = 1.0 - dot(varPointCoord, varPointCoord);",
      "if (z2 < 0.0) discard;",
      "gl_FragDepth = gl_FragCoord.z - sqrt(z2) * varDepth;",
      "FragColor = varColor;",
    ],
  }).code;

  return new TgdProgram(context.gl, { vert, frag });
}
