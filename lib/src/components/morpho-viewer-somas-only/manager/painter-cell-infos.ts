import {
  TgdBoundingBox,
  type TgdContext,
  TgdPainterGroup,
  TgdPainterPointsCloud,
  type TgdPainterPointsCloudOptions,
  TgdTexture2D,
  tgdCanvasCreatePalette,
} from "@tolokoban/tgd";

import type { MorphoViewerCellInfo } from "../types";

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
      },
    }).loadBitmap(
      tgdCanvasCreatePalette(["hsl(180, 100%, 40%)", "hsl(200, 100%, 50%)", "hsl(220, 100%, 60%)"])
    );
    const bbox = new TgdBoundingBox();
    const painterPointsCloudOptions = parseCellInfos(options.cellInfos, bbox);
    const painterPointsCloud = new TgdPainterPointsCloud(context, {
      ...painterPointsCloudOptions,
      texture: texturePalette,
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
  const radius = 15;
  for (const { position } of cellInfos) {
    const [x, y, z] = position;
    bbox.addSphere(x, y, z, radius);
    dataPoint.push(x, y, z, radius);
    dataUV.push(Math.random(), Math.random());
  }
  const options: TgdPainterPointsCloudOptions = {
    dataPoint: new Float32Array(dataPoint),
    dataUV: new Float32Array(dataUV),
  };
  return options;
}
