import {
  TgdBoundingBox,
  type TgdContext,
  TgdPainterGroup,
  TgdPainterPointsCloud,
  type TgdPainterPointsCloudOptions,
  TgdTexture2D,
  tgdCanvasCreatePalette,
} from "@tolokoban/tgd";

import { computeAmbientOcclusion } from "./ambient-occlusion";

import type { MorphoViewerCellInfo } from "../types";

const RADIUS = 15;

/** number of vertical steps used to bake ambient-occlusion shading into each
 * palette column. */
const PALETTE_AO_ROWS = 32;

/** default depth-shaded blue palette, used when cells have no explicit color. */
const DEFAULT_PALETTE_COLORS = [
  "hsl(200, 100%, 80%)",
  "hsl(200, 100%, 50%)",
  "hsl(220, 100%, 30%)",
];

export interface PainterCellInfosOptions {
  cellInfos: MorphoViewerCellInfo[];
  somaRadius: number;
  /** Soma colour opacity in `[0..1]`. Default `1`. */
  opacity?: number;
}

export class PainterCellInfos extends TgdPainterGroup {
  public readonly bbox: TgdBoundingBox;

  private readonly texturePalette: TgdTexture2D;
  private readonly painterPointsCloud: TgdPainterPointsCloud;
  private readonly paletteColors: string[] | null;
  private _opacity: number;

  constructor(
    public readonly context: TgdContext,
    options: PainterCellInfosOptions
  ) {
    const bbox = new TgdBoundingBox();
    const { paletteColors, painterPointsCloudOptions } = parseCellInfos(options.cellInfos, bbox);
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
    const uvs =
      middleLuminance(painterPointsCloudOptions.dataUV) ??
      new Float32Array(2 * options.cellInfos.length);
    const painterPointsCloud = new TgdPainterPointsCloud(context, {
      ...painterPointsCloudOptions,
      dataUV: computeAmbientOcclusion(bbox, 10 * RADIUS, painterPointsCloudOptions.dataPoint, uvs),
      texture: texturePalette,
      fragCode: TgdPainterPointsCloud.fragCodeSphere({
        enableSpecular: true,
        specularExponent: 50,
      }),
      radiusMultiplier: options.somaRadius,
    });
    super({
      name: "PainterCellInfos",
      children: [painterPointsCloud],
    });
    this.painterPointsCloud = painterPointsCloud;
    this.texturePalette = texturePalette;
    this.paletteColors = paletteColors;
    this._opacity = opacity;
    this.bbox = bbox;
  }

  get somaRadius(): number {
    return this.painterPointsCloud.radiusMultiplier;
  }
  set somaRadius(somaRadius: number) {
    if (this.somaRadius === somaRadius) return;

    this.painterPointsCloud.radiusMultiplier = somaRadius;
    this.context.paint();
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

interface ParsedCellInfos {
  /**
   * distinct colors in first-seen order, forming the palette columns, or
   * `null` when no cell defines a color (default blue palette)
   */
  paletteColors: string[] | null;
  painterPointsCloudOptions: TgdPainterPointsCloudOptions;
}

/** fallback column for cells that have no explicit color while others do */
const UNCOLORED_FALLBACK = "hsl(210, 100%, 50%)";

function parseCellInfos(cellInfos: MorphoViewerCellInfo[], bbox: TgdBoundingBox): ParsedCellInfos {
  // map each distinct color to a palette column index (stable, first-seen order)
  const columnByColor = new Map<string, number>();
  const paletteColors: string[] = [];
  let hasUncolored = false;
  for (const { color } of cellInfos) {
    if (color === undefined) {
      hasUncolored = true;
      continue;
    }
    if (columnByColor.has(color)) continue;
    columnByColor.set(color, paletteColors.length);
    paletteColors.push(color);
  }
  const hasColors = paletteColors.length > 0;
  // if some cells are colored and others are not, reserve a dedicated column for
  // the uncolored ones (otherwise their U=0.5 would sample a blended mid-hue)
  const uncoloredColumn = hasColors && hasUncolored ? paletteColors.length : -1;
  if (uncoloredColumn >= 0) paletteColors.push(UNCOLORED_FALLBACK);
  // sample the palette at the horizontal center of each column so linear
  // filtering returns the exact column color for every soma
  const columnU = (index: number) => (index + 0.5) / paletteColors.length;

  const dataPoint: number[] = [];
  const dataUV: number[] = [];
  let centerX = 0;
  let centerY = 0;
  let centerZ = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const { position, color } of cellInfos) {
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
    // set the radius to 1, and will use radiusMultiplier to change it.
    dataPoint.push(x, y, z, 1);
    // U selects the palette column (the color); V carries ambient occlusion,
    // computed later. When there are no colors, U is irrelevant (1px palette).
    // Uncolored cells (in an otherwise-colored set) use the reserved column.
    let u = 0.5;
    if (hasColors) {
      if (color !== undefined) {
        u = columnU(columnByColor.get(color) ?? 0);
      } else if (uncoloredColumn >= 0) {
        u = columnU(uncoloredColumn);
      } else {
        u = columnU(0);
      }
    }
    dataUV.push(u, 0.5);
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
  const options: TgdPainterPointsCloudOptions = {
    dataPoint: new Float32Array(dataPoint),
    dataUV: new Float32Array(dataUV),
  };
  return {
    paletteColors: hasColors ? paletteColors : null,
    painterPointsCloudOptions: options,
  };
}

/**
 * build a palette canvas whose columns are the given colors and whose rows bake
 * in ambient-occlusion shading (top = lit base color, bottom = darkened).
 * points sample their column via U and their occlusion via V
 */
function createCategoricalPalette(colors: string[], rows: number): HTMLCanvasElement {
  const width = colors.length;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  for (let x = 0; x < width; x++) {
    ctx.fillStyle = colors[x];
    ctx.fillRect(x, 0, 1, rows);
  }

  const shade = ctx.createLinearGradient(0, 0, 0, rows);
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(1, "rgba(0, 0, 0, 0.55)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, rows);
  return canvas;
}

function createPaletteBitmap(paletteColors: string[] | null, opacity: number): HTMLCanvasElement {
  const canvas = paletteColors
    ? createCategoricalPalette(paletteColors, PALETTE_AO_ROWS)
    : tgdCanvasCreatePalette(DEFAULT_PALETTE_COLORS, 1);
  return applyCanvasOpacity(canvas, opacity);
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

function middleLuminance(dataUV: Float32Array | undefined): Float32Array | undefined {
  if (!dataUV) return;

  for (let i = 1; i < dataUV.length; i += 2) {
    dataUV[i] = 0.5;
  }
  return dataUV;
}
