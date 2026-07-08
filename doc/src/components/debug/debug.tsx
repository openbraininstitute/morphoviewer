import {
  TgdContext,
  TgdPainterBackground,
  TgdTexture2D,
  tgdCanvasCreate,
  tgdCanvasCreateWithContext2D,
} from "@tolokoban/tgd";

import { classNames } from "@/utils";

import styles from "./debug.module.css";

export interface DebugProps {
  className?: string;
}

export function Debug({ className }: DebugProps) {
  const candidates = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <div className={classNames(className, styles.debug)}>
      {candidates.map((value) => (
        <Example key={value} value={value} />
      ))}
    </div>
  );
}

function Example({ value }: { value: number }) {
  const handleMount = (screen: HTMLCanvasElement | null) => {
    if (!screen) return;

    const { ctx, canvas } = tgdCanvasCreateWithContext2D(20, 3);
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#000";
    const y = 1 + value / 10;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();

    const context = new TgdContext(screen);
    const texture = new TgdTexture2D(context, {
      params: {
        minFilter: "NEAREST",
        magFilter: "NEAREST",
      },
    }).loadBitmap(canvas);
    const background = new TgdPainterBackground(context, {
      texture,
      mode: "cover",
    });
    context.add(background);
    context.paint();
  };

  return (
    <div>
      <canvas ref={handleMount} width={20} height={3}></canvas>
      <div>y = {1 + value / 10}</div>
    </div>
  );
}
