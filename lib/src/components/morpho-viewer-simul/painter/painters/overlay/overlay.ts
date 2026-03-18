import {
  TgdColor,
  TgdContext,
  TgdInputPointerEventTap,
  TgdPainterGroup,
  TgdPainterOverlay,
  TgdTexture2D,
  tgdCalcClamp,
  tgdCanvasCreate,
  tgdCanvasCreateWithContext2D,
} from "@tolokoban/tgd";
import { OVERLAY_HEIGHT, OVERLAY_MARGIN } from "../../constants";
import { SpikingManager } from "../../spiking-manager";
import { PainterCursor } from "./cursor";
import { FramebufferTicks } from "./ticks";

/**
 * This overlay displays the progress bar of the animation,
 * with the ticks where spiking occurs.
 */
export class PainterSpikingOverlay extends TgdPainterGroup {
  private actualWidth = 0;
  private actualHeight = 0;
  private readonly painterTicks: FramebufferTicks;
  private readonly painterOverlay: TgdPainterOverlay;
  private readonly painterCursor: PainterCursor;

  constructor(
    public readonly context: TgdContext,
    private readonly spikingManager: SpikingManager,
  ) {
    super({ name: "PainterSpikingOverlay" });
    this.painterCursor = new PainterCursor(context, spikingManager);
    const texture = new TgdTexture2D(context).loadBitmap(tgdCanvasCreate(1, 1));
    const overlay = new TgdPainterOverlay(context, {
      alignX: +1,
      alignY: -1,
      margin: OVERLAY_MARGIN,
      width: undefined, // Maximum width, according to margins.
      height: OVERLAY_HEIGHT,
      texture,
    });
    this.painterOverlay = overlay;
    this.painterTicks = new FramebufferTicks(context, { texture });
    overlay.eventResize.addListener(({ width, height }) => {
      this.actualWidth = width;
      this.actualHeight = height;
      this.refresh();
    });
    overlay.eventPointerTap.addListener(this.handleTap);
    spikingManager.eventSpikeChange.addListener(this.refresh);
    this.add(overlay, this.painterCursor);
  }

  private readonly handleTap = (evt: TgdInputPointerEventTap) => {
    this.setCursor(evt.x);
  };

  private setCursor(cursorX: number) {
    const [_top, right, _bottom, left] = OVERLAY_MARGIN;
    const width = this.context.width - left - right;
    const height = OVERLAY_HEIGHT;
    const x = ((width + height) * cursorX) / width;
    const normalizedX = tgdCalcClamp(0.5 * (1 + x), 0, 1);
    this.spikingManager.progress = normalizedX;
    this.refresh();
  }

  delete(): void {
    this.painterTicks.delete();
    this.painterOverlay.texture?.delete();
    this.painterOverlay.eventPointerTap.addListener(this.handleTap);
    this.painterOverlay.delete();
    this.spikingManager.eventSpikeChange.removeListener(this.refresh);
    super.delete();
  }

  private readonly refresh = () => {
    this.context.paintOneTime({
      paint: (time: number, delta: number) => {
        this.painterOverlay.texture?.loadBitmap(this.makeCapsule());
        this.painterTicks.spike = this.spikingManager.spike;
        this.painterTicks.paint(time, delta);
      },
    });
    this.context.paint();
  };

  private makeCapsule() {
    const { actualWidth: width, actualHeight: height, spikingManager } = this;
    const color = spikingManager.color.toString();
    const colorDark = TgdColor.fromString(color).luminanceSet(0.5).toString();
    const { canvas, ctx } = tgdCanvasCreateWithContext2D(width, height);
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 2;
    const gradFill = ctx.createLinearGradient(0, 0, 0, height);
    gradFill.addColorStop(0, "#000");
    gradFill.addColorStop(0.5, "#111");
    gradFill.addColorStop(1, colorDark);
    const gradStroke = ctx.createLinearGradient(0, 0, 0, height);
    gradStroke.addColorStop(0, color);
    gradStroke.addColorStop(1, color);
    ctx.fillStyle = gradFill;
    ctx.strokeStyle = gradStroke;
    ctx.beginPath();
    ctx.roundRect(1.5, 1.5, width - 4, height - 4, (height - 4) / 2);
    ctx.fill();
    ctx.stroke();
    return canvas;
  }
}
