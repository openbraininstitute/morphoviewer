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

export interface PainterCellInfosOptions {
  cellInfos: MorphoViewerCellInfo[];
}

export class PainterCellInfos extends TgdPainterGroup {
  public readonly bbox: TgdBoundingBox;
  private readonly texturePalette: TgdTexture2D;

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
        [
          //   "hsl(180, 100%, 90%)",
          "hsl(200, 100%, 90%)",
          //   "hsl(220, 100%, 90%)",
          //   "hsl(180, 100%, 40%)",
          "hsl(200, 100%, 50%)",
          "hsl(220, 100%, 60%)",
          //   "hsl(180, 100%, 10%)",
          //   "hsl(200, 100%, 15%)",
          "hsl(220, 100%, 20%)",
        ],
        3
      )
    );
    const bbox = new TgdBoundingBox();
    const painterPointsCloudOptions = parseCellInfos(options.cellInfos, bbox);
    const uvs =
      middleLuminance(painterPointsCloudOptions.dataUV) ??
      new Float32Array(2 * options.cellInfos.length);
    const painterPointsCloud = new TgdPainterPointsCloud(context, {
      ...painterPointsCloudOptions,
      dataUV: computeAmbientOcclusion(bbox, 5 * RADIUS, painterPointsCloudOptions.dataPoint, uvs),
      texture: texturePalette,
      fragCode: TgdPainterPointsCloud.fragCodeSphere(),
    });
    super({
      name: "PainterCellInfos",
      children: [painterPointsCloud],
    });
    this.texturePalette = texturePalette;
    this.bbox = bbox;
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
  for (const { position } of cellInfos) {
    const [x, y, z] = position;
    bbox.addSphere(x, y, z, RADIUS);
    dataPoint.push(x, y, z, RADIUS);
    dataUV.push(Math.random(), Math.random());
  }
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
