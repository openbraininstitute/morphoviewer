import {
  TgdColor,
  TgdContext,
  TgdInputPointerEventMove,
  TgdInputPointerEventTap,
  TgdPainterGroup,
  TgdPainterOverlay,
  TgdTexture2D,
  tgdCalcClamp,
  tgdCanvasCreate,
  tgdCanvasCreateWithContext2D,
} from "@tolokoban/tgd";
import { SpikingManager } from "../../spiking-manager";
import { PainterCursor } from "./cursor";
import { FramebufferTicks } from "./ticks";
import { TIMELINE_HEIGHT, TIMELINE_MARGIN } from "@/components/morpho-viewer-simul/contants";

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
      margin: TIMELINE_MARGIN,
      width: undefined, // Maximum width, according to margins.
      height: TIMELINE_HEIGHT,
      texture,
    });
    this.painterOverlay = overlay;
    this.painterTicks = new FramebufferTicks(context, { texture });
    overlay.eventResize.addListener(({ width, height }) => {
      this.actualWidth = width;
      this.actualHeight = height;
      this.refresh();
    });
    overlay.eventTap.addListener(this.handleTap);
    overlay.eventMove.addListener(this.handleMove);
    spikingManager.eventSpikeChange.addListener(this.refresh);
    this.add(overlay, this.painterCursor);
  }

  private readonly handleTap = (evt: TgdInputPointerEventTap) => {
    this.setCursor(evt.x);
  };

  private readonly handleMove = (evt: TgdInputPointerEventMove) => {
    this.setCursor(evt.current.x);
    return true;
  };

  /**
   * Returning `true` prevents the event from propagating to the parent.
   */
  private readonly handleMoveStart = () => true;
  private readonly handleMoveEnd = () => true;

  private setCursor(cursorX: number) {
    const [_top, right, _bottom, left] = TIMELINE_MARGIN;
    const width = this.context.width - left - right;
    const height = TIMELINE_HEIGHT;
    const x = ((width + height) * cursorX) / width;
    const normalizedX = tgdCalcClamp(0.5 * (1 + x), 0, 1);
    this.spikingManager.progress = normalizedX;
    this.refresh();
  }

  delete(): void {
    this.painterTicks.delete();
    this.painterOverlay.texture?.delete();
    this.painterOverlay.eventTap.addListener(this.handleTap);
    this.painterOverlay.eventMoveStart.addListener(this.handleMoveStart);
    this.painterOverlay.eventMove.addListener(this.handleMove);
    this.painterOverlay.eventMoveEnd.addListener(this.handleMoveEnd);
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
    const { canvas, ctx } = tgdCanvasCreateWithContext2D(width, height);
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    const gradFill = ctx.createLinearGradient(0, 0, 0, height);
    gradFill.addColorStop(0, setAlpha(color, 0.0));
    gradFill.addColorStop(0.5, setAlpha(color, 0.05));
    gradFill.addColorStop(1, setAlpha(color, 0.2));
    const gradStroke = ctx.createLinearGradient(0, 0, 0, height);
    gradStroke.addColorStop(0, setAlpha(color, 0.2));
    gradStroke.addColorStop(1, setAlpha(color, 0));
    ctx.fillStyle = gradFill;
    ctx.strokeStyle = gradStroke;
    ctx.beginPath();
    ctx.roundRect(1.5, 1.5, width - 4, height - 4, (height - 4) / 2);
    ctx.fill();
    ctx.stroke();
    return canvas;
  }
}

function setAlpha(cssColor: string, alpha: number): string {
  const color = new TgdColor(cssColor);
  color.rgb2hsl();
  color.L = alpha / 2;
  color.hsl2rgb();
  color.A = 1;
  return color.toString();
}
