import { TIMELINE_HEIGHT } from "./../../../../contants";
import { TgdContext, tgdLoadCanvasFromSvg, TgdTexture2D } from "@tolokoban/tgd";

export function makeTexture(context: TgdContext) {
  const texture = new TgdTexture2D(context, {
    params: {
      magFilter: "LINEAR",
      minFilter: "LINEAR",
    },
  });
  tgdLoadCanvasFromSvg(SVG).then((canvas) => {
    texture.loadBitmap(canvas);
    context.paint();
  });
  return texture;
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${TIMELINE_HEIGHT}" height="${TIMELINE_HEIGHT}">
  <circle cx="12" cy="12" r="9" stroke-width=".5" fill="#333" stroke="#777" />
  <circle cx="12" cy="12" r="5" fill="#eee" stroke="none" />
</svg>`;
