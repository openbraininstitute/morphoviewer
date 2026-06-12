import {
  TgdBoundingBox,
  type TgdContext,
  TgdPainterGroup,
  TgdPainterPointsCloud,
  type TgdPainterPointsCloudOptions,
  TgdTexture2D,
  TgdVec3,
  tgdCanvasCreatePalette,
} from "@tolokoban/tgd";

import { computeAmbientOcclusion } from "./ambient-occlusion";

import type { MorphoViewerCellInfo } from "../types";

const RADIUS = 15;

export interface PainterCellInfosOptions {
  cellInfos: MorphoViewerCellInfo[];
  somaRadius: number;
}

export class PainterCellInfos extends TgdPainterGroup {
  public readonly bbox: TgdBoundingBox;

  private readonly texturePalette: TgdTexture2D;
  private readonly painterPointsCloud: TgdPainterPointsCloud;

  constructor(
    public readonly context: TgdContext,
    options: PainterCellInfosOptions
  ) {
    const texturePalette = new TgdTexture2D(context, {
      params: {
        magFilter: "LINEAR",
        minFilter: "LINEAR",
        wrapR: "CLAMP_TO_EDGE",
        wrapS: "CLAMP_TO_EDGE",
        wrapT: "CLAMP_TO_EDGE",
      },
    }).loadBitmap(
      tgdCanvasCreatePalette(
        ["hsl(200, 100%, 80%)", "hsl(200, 100%, 50%)", "hsl(220, 100%, 30%)"],
        1
      )
    );
    const bbox = new TgdBoundingBox();
    const painterPointsCloudOptions = parseCellInfos(options.cellInfos, bbox);
    const uvs =
      middleLuminance(painterPointsCloudOptions.dataUV) ??
      new Float32Array(2 * options.cellInfos.length);
    const painterPointsCloud = new TgdPainterPointsCloud(context, {
      ...painterPointsCloudOptions,
      dataUV: computeAmbientOcclusion(bbox, 15 * RADIUS, painterPointsCloudOptions.dataPoint, uvs),
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

  delete(): void {
    this.texturePalette.delete();
    super.delete();
  }
}

function parseCellInfos(
  cellInfos: MorphoViewerCellInfo[],
  bbox: TgdBoundingBox
): TgdPainterPointsCloudOptions {
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
    // We set the radius to 1, and will use radiusMultiplier to change it.
    dataPoint.push(x, y, z, 1);
    dataUV.push(Math.random(), Math.random());
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
  return options;
}

function middleLuminance(dataUV: Float32Array | undefined): Float32Array | undefined {
  if (!dataUV) return;

  for (let i = 1; i < dataUV.length; i += 2) {
    dataUV[i] = 0.5;
  }
  return dataUV;
}
