import {
  TgdContext,
  TgdPainter,
  TgdPainterGroup,
  TgdPainterIcon,
  TgdTexture2D,
} from "@tolokoban/tgd";
import { SpikingManager } from "../../../spiking-manager";
import { PainterCursorFill } from "./fill";
import { makeTexture } from "./texture";
import { TIMELINE_HEIGHT, TIMELINE_MARGIN } from "@/components/morpho-viewer-simul/contants";

export class PainterCursor extends TgdPainter {
  private readonly group = new TgdPainterGroup();
  private readonly icon: TgdPainterIcon;
  private readonly texture: TgdTexture2D;

  constructor(
    context: TgdContext,
    private readonly spikingManager: SpikingManager,
  ) {
    super();
    this.name = "PainterCursor";
    const texture = makeTexture(context);
    const fill = new PainterCursorFill(context, spikingManager);
    const icon = new TgdPainterIcon(context, {
      texture,
      alignX: 0,
      alignY: -1,
      margin: TIMELINE_MARGIN,
      width: TIMELINE_HEIGHT,
      height: TIMELINE_HEIGHT,
    });
    this.group.add(fill, icon);
    this.texture = texture;
    this.icon = icon;
  }

  delete(): void {
    this.group.delete();
    this.texture.delete();
  }

  paint(time: number, delta: number): void {
    this.icon.alignX = 2 * this.spikingManager.progress - 1;
    this.group.paint(time, delta);
  }
}
