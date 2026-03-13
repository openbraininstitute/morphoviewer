import {
  tgdCanvasCreate,
  tgdCanvasCreateWithContext2D,
  TgdContext,
  TgdPainterOverlay,
  TgdTexture2D,
} from "@tolokoban/tgd";
import { FramebufferTicks } from "./ticks";

export class PainterSpikingOverlay extends TgdPainterOverlay {
  private actualWidth = 0;
  private actualHeight = 0;
  private readonly painterTicks: FramebufferTicks;

  constructor(public readonly context: TgdContext) {
    const texture = new TgdTexture2D(context).loadBitmap(tgdCanvasCreate(8, 8));
    super(context, {
      alignX: +1,
      alignY: -1,
      margin: [0, 8, 8, 64],
      height: 32,
      texture,
    });
    try {
      this.texture = texture;
      this.painterTicks = new FramebufferTicks(context, { texture });
      this.eventResize.addListener(({ width, height }) => {
        this.actualWidth = width;
        this.actualHeight = height;
        this.refresh();
      });
    } catch (error) {
      console.error("Error in PainterSpikingOverlay!");
      throw error;
    }
  }

  delete(): void {
    this.painterTicks.delete();
    this.texture?.delete();
    super.delete();
  }

  private readonly refresh = () => {
    this.context.paintOneTime(
      { paint: () => this.texture?.loadBitmap(this.makeCapsule()) },
      this.painterTicks,
    );
  };

  private makeCapsule() {
    const { actualWidth: width, actualHeight: height } = this;
    const { canvas, ctx } = tgdCanvasCreateWithContext2D(width, height);
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 2;
    const gradFill = ctx.createLinearGradient(0, 0, 0, height);
    gradFill.addColorStop(0, "#000");
    gradFill.addColorStop(0.5, "#111");
    gradFill.addColorStop(1, "rgb(80, 48, 0)");
    const gradStroke = ctx.createLinearGradient(0, 0, 0, height);
    gradStroke.addColorStop(0, "#f90");
    gradStroke.addColorStop(1, "#f90");
    ctx.fillStyle = gradFill;
    ctx.strokeStyle = gradStroke;
    ctx.beginPath();
    ctx.roundRect(1.5, 1.5, width - 4, height - 4, (height - 4) / 2);
    ctx.fill();
    ctx.stroke();
    return canvas;
  }
}
