import { TgdBoundingBox, type TgdContext, TgdPainterGroup, TgdTexture2D } from "@tolokoban/tgd";

import { computeAmbientOcclusion } from "./ambient-occlusion";
import { PainterSomaCloud } from "./painter-soma-cloud";

import type { MorphoViewerCellColors, MorphoViewerCellInfo } from "../types";

const RADIUS = 15;

/** number of vertical steps used to bake ambient-occlusion shading into each
 * palette column. */
const PALETTE_AO_ROWS = 32;

/** The ramp occlusion runs along for a soma nobody has given a colour. */
const DEFAULT_PALETTE_COLORS = [
  "hsl(200, 100%, 80%)",
  "hsl(200, 100%, 50%)",
  "hsl(220, 100%, 30%)",
];

export interface PainterCellInfosOptions {
  /** Read for the positions alone; the colours it carries are the caller's job. */
  cellInfos: MorphoViewerCellInfo[];
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
   * occlusion, which costs about a second at region scale and depends on the
   * positions alone, so {@link recolor} rewrites `u` around it.
   */
  private readonly dataUV: Float32Array<ArrayBuffer>;
  private paletteColors: (string | null)[] | null;
  private _opacity: number;

  constructor(
    public readonly context: TgdContext,
    options: PainterCellInfosOptions
  ) {
    const bbox = new TgdBoundingBox();
    const dataPoint = parsePositions(options.cellInfos, bbox);
    const dataUV = new Float32Array(2 * options.cellInfos.length).fill(0.5);
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
    computeAmbientOcclusion(bbox, 10 * RADIUS, dataPoint, dataUV);
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
    this.count = options.cellInfos.length;
    this.dataUV = dataUV;
    this.paletteColors = paletteColors;
    this._opacity = opacity;
    this.bbox = bbox;
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
   */
  recolor(colors: MorphoViewerCellColors | null) {
    // A count that no longer matches means the host is mid-change: its colours
    // have arrived and its geometry has not. Painting them onto the somas
    // standing here would put the wrong colour on some of them for a frame, and
    // the rebuild that is coming repaints everything anyway.
    if (colors && colors.palette.length > 0 && colors.columnByCell.length !== this.count) return;

    this.paletteColors = writeColumns(this.dataUV, colors);
    this.texturePalette.loadBitmap(createPaletteBitmap(this.paletteColors, this._opacity));
    this.painterPointsCloud.setUV(this.dataUV);
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

  delete(): void {
    this.texturePalette.delete();
    super.delete();
  }
}

/**
 * Positions into `[x, y, z, radius]` per soma, and the bounding box around
 * them.
 *
 * Written into a sized `Float32Array` rather than pushed onto a `number[]` and
 * converted: at region scale that array is twenty million boxed numbers, and
 * the garbage it leaves behind outweighs the parse itself.
 */
function parsePositions(
  cellInfos: MorphoViewerCellInfo[],
  bbox: TgdBoundingBox
): Float32Array<ArrayBuffer> {
  const dataPoint = new Float32Array(4 * cellInfos.length);
  let centerX = 0;
  let centerY = 0;
  let centerZ = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let index = 0;
  for (const { position } of cellInfos) {
    const [x, y, z] = position;
    centerX += x;
    centerY += y;
    centerZ += z;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
    dataPoint[index++] = x;
    dataPoint[index++] = y;
    dataPoint[index++] = z;
    // set the radius to 1, and will use radiusMultiplier to change it.
    dataPoint[index++] = 1;
  }
  const invCount = 1 / cellInfos.length;
  centerX *= invCount;
  centerY *= invCount;
  centerZ *= invCount;
  const radiusX = Math.max(Math.abs(maxX - centerX), Math.abs(centerX - minX));
  const radiusY = Math.max(Math.abs(maxY - centerY), Math.abs(centerY - minY));
  const radiusZ = Math.max(Math.abs(maxZ - centerZ), Math.abs(centerZ - minZ));
  bbox.addSphere(centerX + radiusX, centerY + radiusY, centerZ + radiusZ, RADIUS);
  bbox.addSphere(centerX - radiusX, centerY - radiusY, centerZ - radiusZ, RADIUS);
  return dataPoint;
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
): (string | null)[] | null {
  if (!colors || colors.palette.length === 0) return null;

  const { palette, columnByCell } = colors;
  const width = palette.length;
  const last = width - 1;
  for (let cell = 0; cell < columnByCell.length; cell++) {
    // the horizontal center of the column, so linear filtering returns the
    // exact column color for every soma
    dataUV[cell * 2] = (Math.min(columnByCell[cell], last) + 0.5) / width;
  }
  return palette;
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
 */
function createPalette(colors: (string | null)[], rows: number): HTMLCanvasElement {
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
    ctx.fillStyle = color ?? ramp;
    ctx.fillRect(x, 0, 1, rows);
    if (color === null) continue;

    ctx.fillStyle = shade;
    ctx.fillRect(x, 0, 1, rows);
  }
  return canvas;
}

function createPaletteBitmap(
  paletteColors: (string | null)[] | null,
  opacity: number
): HTMLCanvasElement {
  // No palette at all is the one-column palette holding the ramp: every soma
  // leaves `u` at the middle of it, so they all sample that column.
  return applyCanvasOpacity(createPalette(paletteColors ?? [null], PALETTE_AO_ROWS), opacity);
}

/** Force every pixel's alpha channel to `opacity` (keeps RGB shading intact). */
function applyCanvasOpacity(canvas: HTMLCanvasElement, opacity: number): HTMLCanvasElement {
  if (opacity >= 1) return canvas;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const alpha = Math.round(clamp01(opacity) * 255);
  for (let i = 3; i < image.data.length; i += 4) {
    image.data[i] = alpha;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(1, Math.max(0, value));
}
