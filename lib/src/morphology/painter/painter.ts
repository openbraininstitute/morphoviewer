import { TgdContext, TgdPainterSegments } from "@tolokoban/tgd";

import { ColorsInterface } from "@/colors";
import { CellNodes } from "./nodes";
import { getDistancesTextureCanvas, getRegionsTextureCanvas } from "./textures";
import { makeData } from "./factory";

export class SwcPainter extends TgdPainterSegments {
  public minRadius = 1.5;

  private colors: ColorsInterface | undefined;
  private _colorBy: "section" | "distance" = "section";
  private textureIsOutOfDate = true;
  private _somaVisible = true;

  private customColorsForSection: string[] | null = null;
  private customColorsForDistance: string[] | null = null;

  constructor(
    public readonly context: TgdContext,
    nodes: CellNodes,
  ) {
    super(context, {
      dataset: makeData(nodes).makeDataset,
      roundness: 24,
    });
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
      colorTexture,
      colorBy,
      textureIsOutOfDate,
      customColorsForSection,
      customColorsForDistance,
    } = this;
    if (textureIsOutOfDate) {
      colorTexture.loadBitmap(
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
