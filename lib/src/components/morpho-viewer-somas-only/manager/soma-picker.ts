/* eslint-disable no-bitwise */
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

import { spiralPixelOffsets } from "@/morphology-picking";

import { decodeSomaPickColor } from "./soma-pick-codec";

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
   * small-circuit `getItemNear`, which this mirrors.
   */
  private readIndexNear(
    xClip: number,
    yClip: number,
    radiusInPixels: number
  ): number | null {
    const { offscreenCanvas } = this;
    // The pointer arrives in clip space, so a pixel step is two clip units over the size.
    const stepX = 2 / Math.max(1, offscreenCanvas.width);
    const stepY = 2 / Math.max(1, offscreenCanvas.height);
    for (const [dx, dy] of spiralPixelOffsets(radiusInPixels)) {
      const index = decodeSomaPickColor(
        this.context.readPixel(xClip + dx * stepX, yClip + dy * stepY)
      );
      if (index !== null) return index;
    }
    return null;
  }

  delete() {
    this.isDeleted = true;
    this.context.delete();
  }
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
 * there is 1 — so a pick lands wherever the eye saw the soma. Depth follows
 * the same sphere profile for the same reason: where two somas overlap, the
 * one in front visually is the one a click resolves to. What it deliberately
 * drops is everything about appearance (palette, occlusion, glow); the one
 * mismatch that leaves is the glow swell, so a spiking soma's pick target is
 * up to 70% smaller than its flash. The search spiral covers that.
 */
class PainterSomaCloudId extends TgdPainter {
  public radiusMultiplier = 1;

  private readonly count: number;
  private readonly program: TgdProgram;
  private readonly vao: TgdVertexArray;

  constructor(
    public readonly context: TgdContext,
    options: PainterSomaCloudIdOptions
  ) {
    super("PainterSomaCloudId");
    this.count = options.positions.length / 3;

    const instances = new TgdDataset({ attPoint: "vec3" }, { divisor: 1 });
    instances.set("attPoint", options.positions);

    const billboards = new TgdDataset({ attPointCoord: "vec2" });
    billboards.set("attPointCoord", new Float32Array([-1, -1, +1, -1, +1, +1, -1, +1]));

    this.program = createIdProgram(context);
    this.vao = new TgdVertexArray(context.gl, this.program, [instances, billboards]);
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
      /** Between -1.0 and +1.0 */
      attPointCoord: "vec2",
    },
    varying: {
      varColor: "vec4",
      varPointCoord: "vec2",
      varDepth: "float",
    },
    mainCode: [
      "int id = gl_InstanceID + 1;",
      "varColor = vec4(vec3(float(id & 0xFF), float((id >> 8) & 0xFF), float((id >> 16) & 0xFF)) / 255.0, 1.0);",
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
