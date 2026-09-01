import { TgdBoundingBox, type TgdContext, TgdPainterGroup, TgdTexture2D } from "@tolokoban/tgd";

import { AmbientOcclusionComputation } from "./ambient-occlusion";
import { PainterSomaCloud } from "./painter-soma-cloud";

import type { MorphoViewerCellColors, MorphoViewerCellInfo } from "../types";

const RADIUS = 15;

/** number of vertical steps used to bake ambient-occlusion shading into each
 * palette column. */
const PALETTE_AO_ROWS = 32;

/** Somas advanced between two looks at what is left of an idle slice. */
const AO_CHUNK_SIZE = 10_000;
/** Idle milliseconds below which a slice hands the thread back. */
const AO_MIN_BUDGET_MS = 3;
/** Slice length where `requestIdleCallback` does not exist (Safari, jsdom). */
const AO_FALLBACK_SLICE_MS = 8;

/** The ramp occlusion runs along for a soma nobody has given a colour. */
const DEFAULT_PALETTE_COLORS = [
  "hsl(200, 100%, 80%)",
  "hsl(200, 100%, 50%)",
  "hsl(220, 100%, 30%)",
];

export interface PainterCellInfosOptions {
  /**
   * Flat `[x, y, z, ...]` soma positions, read as they are — no object per
   * soma. Wins over {@link cellInfos} when both are given.
   */
  positions?: Float32Array;
  /** Read for the positions alone; the colours it carries are the caller's job. */
  cellInfos?: MorphoViewerCellInfo[];
  /** The colour each soma takes, or `null` for the default blue palette. */
  colors: MorphoViewerCellColors | null;
  somaRadius: number;
  /** Soma colour opacity in `[0..1]`. Default `1`. */
  opacity?: number;
}

export class PainterCellInfos extends TgdPainterGroup {
  public readonly bbox: TgdBoundingBox;

  /** Somas drawn, which is what a set of colours has to have one of each. */
  private readonly count: number;

  private readonly texturePalette: TgdTexture2D;
  private readonly painterPointsCloud: PainterSomaCloud;
  /**
   * `[u, v]` per soma, kept rather than handed over: `v` is the ambient
   * occlusion, which depends on the positions alone and arrives behind the
   * first paint (see {@link scheduleAmbientOcclusion}), so {@link recolor}
   * rewrites `u` around it.
   */
  private readonly dataUV: Float32Array<ArrayBuffer>;
  private paletteColors: (string | null | false)[] | null;
  private _opacity: number;
  /** Stops the pending occlusion slice; null once it has run or been cut. */
  private cancelAmbientOcclusion: (() => void) | null = null;

  constructor(
    public readonly context: TgdContext,
    options: PainterCellInfosOptions
  ) {
    const bbox = new TgdBoundingBox();
    const dataPoint = options.positions
      ? packPositions(options.positions)
      : parsePositions(options.cellInfos ?? []);
    addSomaBounds(dataPoint, bbox);
    const count = dataPoint.length >> 2;
    const dataUV = new Float32Array(2 * count).fill(0.5);
    const paletteColors = writeColumns(dataUV, options.colors);
    const opacity = clamp01(options.opacity ?? 1);
    const texturePalette = new TgdTexture2D(context, {
      params: {
        magFilter: "LINEAR",
        minFilter: "LINEAR",
        wrapR: "CLAMP_TO_EDGE",
        wrapS: "CLAMP_TO_EDGE",
        wrapT: "CLAMP_TO_EDGE",
      },
    }).loadBitmap(createPaletteBitmap(paletteColors, opacity));
    const painterPointsCloud = new PainterSomaCloud(context, {
      dataPoint,
      dataUV,
      texture: texturePalette,
      radiusMultiplier: options.somaRadius,
    });
    super({
      name: "PainterCellInfos",
      children: [painterPointsCloud],
    });
    this.painterPointsCloud = painterPointsCloud;
    this.texturePalette = texturePalette;
    this.count = count;
    this.dataUV = dataUV;
    this.paletteColors = paletteColors;
    this._opacity = opacity;
    this.bbox = bbox;
    // The cloud goes up with the flat shading `dataUV` was filled with; the
    // occlusion is computed behind it and applied when it is ready.
    this.scheduleAmbientOcclusion(new AmbientOcclusionComputation(bbox, 10 * RADIUS, dataPoint));
  }

  /**
   * Give the same somas new colours.
   *
   * Only the caller knows the somas have not moved — for the viewer that is
   * `sameGeometry` — and on that promise this touches nothing but the palette
   * and the column each soma samples from it. Rebuilding the painter instead
   * would re-read every position, recompute the ambient occlusion and re-upload
   * the whole cloud, which is over a second at region scale for a change the
   * GPU can absorb in a single buffer write.
   *
   * @returns Whether the colours were taken. `false` leaves the cloud on the
   * palette it had, and the caller still holding what it owes it.
   */
  recolor(colors: MorphoViewerCellColors | null): boolean {
    // A count that no longer matches means the host is mid-change: its colours
    // have arrived and its geometry has not. Painting them onto the somas
    // standing here would put the wrong colour on some of them for a frame, and
    // the rebuild that is coming repaints everything anyway.
    if (colors && colors.palette.length > 0 && colors.columnByCell.length !== this.count) {
      return false;
    }

    this.paletteColors = writeColumns(this.dataUV, colors);
    this.texturePalette.loadBitmap(createPaletteBitmap(this.paletteColors, this._opacity));
    this.painterPointsCloud.setUV(this.dataUV);
    return true;
  }

  get somaRadius(): number {
    return this.painterPointsCloud.radiusMultiplier;
  }
  set somaRadius(somaRadius: number) {
    if (this.somaRadius === somaRadius) return;

    this.painterPointsCloud.radiusMultiplier = somaRadius;
    this.context.paint();
  }

  /** This frame's brightness for every soma, indexed like `cellInfos`. */
  setGlow(glow: Readonly<Float32Array>) {
    this.painterPointsCloud.setGlow(glow);
  }

  get opacity(): number {
    return this._opacity;
  }
  set opacity(opacity: number) {
    const next = clamp01(opacity);
    if (this._opacity === next) return;

    this._opacity = next;
    this.texturePalette.loadBitmap(createPaletteBitmap(this.paletteColors, next));
    this.context.paint();
  }

  /**
   * Fill the occlusion in behind the first paint.
   *
   * Computing it inline is about a second at region scale, and it was the
   * last thing standing between geometry arriving and somas on screen. So the
   * cloud goes up flat-shaded, the arithmetic runs in idle slices — handing
   * the thread back whenever the browser wants it — and the result lands
   * through the same {@link PainterSomaCloud.setUV} write a recolour uses,
   * plus one repaint.
   *
   * A recolour mid-computation is safe on both sides: it writes `u` where
   * this writes `v`, and the running totals live in the computation rather
   * than in {@link dataUV}, so an interim upload carries flat shading, not
   * half of an unnormalized result. Deleting the painter cancels the pending
   * slice, which is the only handle there is.
   */
  private scheduleAmbientOcclusion(computation: AmbientOcclusionComputation) {
    if (computation.done) return;

    const runSlice = (timeRemaining: () => number) => {
      this.cancelAmbientOcclusion = null;
      let done = computation.advance(AO_CHUNK_SIZE);
      while (!done && timeRemaining() > AO_MIN_BUDGET_MS) {
        done = computation.advance(AO_CHUNK_SIZE);
      }
      if (!done) {
        schedule();
        return;
      }
      computation.writeInto(this.dataUV);
      this.painterPointsCloud.setUV(this.dataUV);
      this.context.paint();
    };
    const schedule = () => {
      if (typeof requestIdleCallback === "function") {
        const handle = requestIdleCallback((deadline) => runSlice(() => deadline.timeRemaining()));
        this.cancelAmbientOcclusion = () => cancelIdleCallback(handle);
      } else {
        // Safari and jsdom. A macrotask with a fixed budget slices the same
        // way, minus knowing whether the frame is actually idle.
        const handle = setTimeout(() => {
          const start = performance.now();
          runSlice(() => AO_FALLBACK_SLICE_MS - (performance.now() - start));
        }, 0);
        this.cancelAmbientOcclusion = () => clearTimeout(handle);
      }
    };
    schedule();
  }

  delete(): void {
    this.cancelAmbientOcclusion?.();
    this.cancelAmbientOcclusion = null;
    this.texturePalette.delete();
    super.delete();
  }
}

/**
 * The same somas from positions already flat: `[x, y, z]` triples into
 * `[x, y, z, radius]`.
 *
 * Its own loop rather than `parsePositions` over a wrapper: this is the path
 * that exists so a region-scale host never builds an object per soma, and it
 * reads the floats where they already are.
 */
function packPositions(positions: Float32Array): Float32Array<ArrayBuffer> {
  const count = Math.floor(positions.length / 3);
  const dataPoint = new Float32Array(4 * count);
  for (let soma = 0; soma < count; soma++) {
    dataPoint[soma * 4] = positions[soma * 3];
    dataPoint[soma * 4 + 1] = positions[soma * 3 + 1];
    dataPoint[soma * 4 + 2] = positions[soma * 3 + 2];
    // set the radius to 1, and will use radiusMultiplier to change it.
    dataPoint[soma * 4 + 3] = 1;
  }
  return dataPoint;
}

/**
 * Positions into `[x, y, z, radius]` per soma.
 *
 * Written into a sized `Float32Array` rather than pushed onto a `number[]` and
 * converted: at region scale that array is twenty million boxed numbers, and
 * the garbage it leaves behind outweighs the parse itself.
 */
function parsePositions(cellInfos: MorphoViewerCellInfo[]): Float32Array<ArrayBuffer> {
  const dataPoint = new Float32Array(4 * cellInfos.length);
  let index = 0;
  for (const { position } of cellInfos) {
    dataPoint[index++] = position[0];
    dataPoint[index++] = position[1];
    dataPoint[index++] = position[2];
    // set the radius to 1, and will use radiusMultiplier to change it.
    dataPoint[index++] = 1;
  }
  return dataPoint;
}

/**
 * The box the camera frames the cloud with: a centre and a symmetric radius
 * rather than the plain min/max box, so an outlier pulls the frame out on both
 * sides and the cloud stays centred where the somas actually are.
 *
 * One pass over the packed array both paths have just written, rather than
 * accumulated inside each of them — the arithmetic has nothing to do with
 * where the floats came from, and two copies of it is where it would drift.
 */
function addSomaBounds(dataPoint: Readonly<Float32Array>, bbox: TgdBoundingBox): void {
  const count = dataPoint.length >> 2;
  if (count === 0) return;

  let centerX = 0;
  let centerY = 0;
  let centerZ = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let soma = 0; soma < count; soma++) {
    const x = dataPoint[soma * 4];
    const y = dataPoint[soma * 4 + 1];
    const z = dataPoint[soma * 4 + 2];
    centerX += x;
    centerY += y;
    centerZ += z;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const invCount = 1 / count;
  centerX *= invCount;
  centerY *= invCount;
  centerZ *= invCount;
  const radiusX = Math.max(Math.abs(maxX - centerX), Math.abs(centerX - minX));
  const radiusY = Math.max(Math.abs(maxY - centerY), Math.abs(centerY - minY));
  const radiusZ = Math.max(Math.abs(maxZ - centerZ), Math.abs(centerZ - minZ));
  bbox.addSphere(centerX + radiusX, centerY + radiusY, centerZ + radiusZ, RADIUS);
  bbox.addSphere(centerX - radiusX, centerY - radiusY, centerZ - radiusZ, RADIUS);
}

/**
 * The palette column a soma takes.
 *
 * The one place that rule is stated: what is drawn and what is pickable are
 * decided by two different walks over these columns, and a soma that landed in
 * different columns between them would be invisible and still swallow clicks.
 *
 * A column past the end of the palette is clamped to the last one; a soma the
 * host described no column for takes the first. That is a column like any
 * other — hidden if the palette hides it — and answering here rather than
 * leaving `u` at whatever it held is what keeps the two walks together: at a
 * palette one column wide, the middle of the texture *is* that column, so
 * "keep the default" meant culled on screen and pickable all the same.
 */
function columnForCell(colors: MorphoViewerCellColors, cell: number): number {
  const column = cell < colors.columnByCell.length ? colors.columnByCell[cell] : 0;
  return Math.min(column, colors.palette.length - 1);
}

/**
 * Write the palette column each soma samples into `u`, leaving `v` — the
 * ambient occlusion — as it was found. Answers the palette those columns index,
 * which is `null` when there is none: that palette is one pixel wide, so `u`
 * means nothing and is left alone.
 */
function writeColumns(
  dataUV: Float32Array,
  colors: MorphoViewerCellColors | null
): (string | null | false)[] | null {
  if (!colors || colors.palette.length === 0) return null;

  const { palette } = colors;
  const width = palette.length;
  // Every soma, not only the ones the host gave a column for: one left behind
  // samples the middle of the palette, which is a column nobody chose.
  const count = dataUV.length >> 1;
  for (let cell = 0; cell < count; cell++) {
    // the horizontal center of the column, so linear filtering returns the
    // exact column color for every soma
    dataUV[cell * 2] = (columnForCell(colors, cell) + 0.5) / width;
  }
  return palette;
}

/**
 * One entry per soma, `1` where the palette leaves it undrawn and `0` where it
 * is on screen. Null when nothing is hidden, which is the common case and
 * saves a walk over every soma.
 *
 * The picker paints its own cloud, on its own context, and samples no palette
 * — so it has to be told. Filtering its answer afterwards would not do: it
 * reports the first soma outward from the click, so a hidden one in front
 * swallows the click meant for whatever stands behind it, and there is nothing
 * left to filter.
 */
export function hiddenSomaMask(
  colors: MorphoViewerCellColors | null,
  count: number
): Float32Array | null {
  if (!colors?.palette.includes(false)) return null;

  const { palette } = colors;
  const hidden = new Float32Array(count);
  for (let cell = 0; cell < count; cell++) {
    if (palette[columnForCell(colors, cell)] === false) hidden[cell] = 1;
  }
  return hidden;
}

/**
 * The palette a `cellInfos` array carries in its own `color` fields: the
 * distinct colors in first-seen order, and the column each soma takes.
 *
 * This is the older of the two ways to colour a cloud, and the slower one —
 * reading it means walking every cell. {@link MorphoViewerCellColors} says the
 * same thing directly.
 */
export function cellPaletteFromCellInfos(
  cellInfos: MorphoViewerCellInfo[]
): MorphoViewerCellColors | null {
  // map each distinct color to a palette column index (stable, first-seen order)
  const columnByColor = new Map<string, number>();
  const palette: (string | null)[] = [];
  let hasUncolored = false;
  for (const { color } of cellInfos) {
    if (color === undefined) {
      hasUncolored = true;
      continue;
    }
    if (columnByColor.has(color)) continue;
    columnByColor.set(color, palette.length);
    palette.push(color);
  }
  if (palette.length === 0) return null;

  // if some cells are colored and others are not, reserve a dedicated column for
  // the uncolored ones (otherwise they would sample a neighbour's hue)
  const uncoloredColumn = hasUncolored ? palette.length : 0;
  if (hasUncolored) palette.push(null);

  const columnByCell = new Uint16Array(cellInfos.length);
  let cell = 0;
  for (const { color } of cellInfos) {
    columnByCell[cell++] = color === undefined ? uncoloredColumn : (columnByColor.get(color) ?? 0);
  }
  return { palette, columnByCell };
}

/**
 * Build a palette canvas whose columns are the given colors and whose rows bake
 * in ambient-occlusion shading. Points sample their column via U and their
 * occlusion via V.
 *
 * A `null` column is painted with {@link DEFAULT_PALETTE_COLORS} instead: the
 * occlusion then carries the whole column rather than merely darkening one
 * hue, which is what a cloud nobody has coloured has always looked like.
 *
 * A `false` column is left clear, which is how a soma goes undrawn: the cloud
 * culls whatever samples an alpha of zero. It is the only way — a colour of
 * its own carrying zero alpha still takes the occlusion shade composited over
 * it, and comes out a dark soma rather than no soma.
 */
function createPalette(colors: (string | null | false)[], rows: number): HTMLCanvasElement {
  const width = colors.length;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const shade = ctx.createLinearGradient(0, 0, 0, rows);
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(1, "rgba(0, 0, 0, 0.55)");

  const ramp = ctx.createLinearGradient(0, 0, 0, rows);
  const lastStop = DEFAULT_PALETTE_COLORS.length - 1;
  for (let stop = 0; stop <= lastStop; stop++) {
    ramp.addColorStop(stop / lastStop, DEFAULT_PALETTE_COLORS[stop]);
  }

  for (let x = 0; x < width; x++) {
    const color = colors[x];
    // Left untouched, shade included: the canvas starts transparent, and
    // compositing the shade over a clear column would bring the somas back as
    // dark blobs rather than leaving them out.
    if (color === false) continue;

    ctx.fillStyle = color ?? ramp;
    ctx.fillRect(x, 0, 1, rows);
    if (color === null) continue;

    ctx.fillStyle = shade;
    ctx.fillRect(x, 0, 1, rows);
  }
  return canvas;
}

function createPaletteBitmap(
  paletteColors: (string | null | false)[] | null,
  opacity: number
): HTMLCanvasElement {
  // No palette at all is the one-column palette holding the ramp: every soma
  // leaves `u` at the middle of it, so they all sample that column.
  return applyCanvasOpacity(createPalette(paletteColors ?? [null], PALETTE_AO_ROWS), opacity);
}

/**
 * Force every pixel's alpha channel to `opacity` (keeps RGB shading intact),
 * except the columns left clear for somas that are not drawn — the opacity
 * setting is about the somas on screen and must not bring those back.
 *
 * Which is also why the floor is one step rather than zero: at `opacity: 0` a
 * soma stays drawn and invisible, as it always has, instead of falling into
 * the cloud's cull and taking its glow with it.
 */
function applyCanvasOpacity(canvas: HTMLCanvasElement, opacity: number): HTMLCanvasElement {
  if (opacity >= 1) return canvas;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const alpha = Math.max(1, Math.round(clamp01(opacity) * 255));
  for (let i = 3; i < image.data.length; i += 4) {
    if (image.data[i] === 0) continue;

    image.data[i] = alpha;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(1, Math.max(0, value));
}
