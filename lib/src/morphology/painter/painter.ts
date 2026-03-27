/** biome-ignore-all lint/suspicious/noAssignInExpressions: <explanation> */
import {
  type TgdContext,
  TgdMaterialDiffuse,
  TgdPainterGroup,
  TgdPainterSegments,
  TgdTexture2D,
} from "@tolokoban/tgd";

import { makeData } from "./factory";
import { getDistancesTextureCanvas, getRegionsTextureCanvas } from "./textures";

import type { ColorsInterface } from "@/colors";
import type { CellNodes } from "./nodes";

export class SwcPainter extends TgdPainterGroup {
  private colors: ColorsInterface | undefined;
  private _colorBy: "section" | "distance" = "section";
  private textureIsOutOfDate = true;
  private _somaVisible = true;
  private readonly texture: TgdTexture2D;
  private radiusSwitch = 0;
  private customColorsForSection: string[] | null = null;
  private customColorsForDistance: string[] | null = null;
  private readonly painterNeurites: TgdPainterSegments;

  constructor(
    public readonly context: TgdContext,
    nodes: CellNodes,
  ) {
    super();
    const texture = (this.texture = new TgdTexture2D(context, {
      params: {
        wrapR: "CLAMP_TO_EDGE",
        wrapS: "CLAMP_TO_EDGE",
        wrapT: "CLAMP_TO_EDGE",
      },
    }));
    const material = new TgdMaterialDiffuse({
      color: texture,
      lockLightsToCamera: true,
    });
    const { neurites, soma } = makeData(nodes);
    const painterNeurites = (this.painterNeurites = new TgdPainterSegments(
      context,
      {
        dataset: neurites.makeDataset,
        minRadius: 2,
        roundness: 8,
        material,
      },
    ));
    const painterSoma = new TgdPainterSegments(context, {
      dataset: soma.makeDataset,
      minRadius: 2,
      roundness: 48,
      material,
    });
    this.add(painterNeurites, painterSoma);
  }

  get minRadius() {
    return this.painterNeurites.minRadius;
  }
  set minRadius(radius: number) {
    this.painterNeurites.minRadius = radius;
  }

  get radiusMultiplier() {
    return this.painterNeurites.radiusMultiplier;
  }
  set radiusMultiplier(radius: number) {
    console.log("🐞 [painter@67] radius =", radius); // @FIXME: Remove this line written on 2026-02-18 at 10:09
    this.painterNeurites.radiusMultiplier = radius;
  }

  get somaVisible() {
    return this._somaVisible;
  }

  set somaVisible(visible: boolean) {
    if (visible === this._somaVisible) return;

    this._somaVisible = visible;
    this.textureIsOutOfDate = true;
  }

  get colorBy() {
    return this._colorBy;
  }
  set colorBy(value: "section" | "distance") {
    if (value === this._colorBy) return;

    this._colorBy = value;
    this.textureIsOutOfDate = true;
    this.refresh();
  }

  get radiusType() {
    return this.radiusSwitch;
  }
  set radiusType(value: number) {
    this.radiusSwitch = value;
  }

  public readonly paint = (time: number, delay: number) => {
    this.updateTextureIfNeeded();
    super.paint(time, delay);
  };

  private updateTextureIfNeeded() {
    const {
      texture,
      colorBy,
      textureIsOutOfDate,
      customColorsForSection,
      customColorsForDistance,
    } = this;
    if (textureIsOutOfDate) {
      texture.loadBitmap(
        colorBy === "section"
          ? getRegionsTextureCanvas(
              this.somaVisible,
              this.colors ?? {},
              customColorsForSection,
            )
          : getDistancesTextureCanvas(
              this.colors ?? {},
              customColorsForDistance,
            ),
      );
      this.textureIsOutOfDate = false;
    }
  }

  resetColors(
    colors: ColorsInterface,
    customColorsForSection: string[] | null,
    customColorsForDistance: string[] | null,
  ) {
    this.textureIsOutOfDate = true;
    this.customColorsForSection = customColorsForSection;
    this.customColorsForDistance = customColorsForDistance;
    this.colors = colors;
    this.refresh();
  }

  public readonly refresh = () => {
    this.context.paint();
  };
}
