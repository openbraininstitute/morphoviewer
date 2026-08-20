import type { TgdContext, TgdEvent } from "@tolokoban/tgd";

/** Dispatch the space one CSS pixel covers. The camera measures in device pixels. */
export function watchSpacePerPixel(context: TgdContext, event: TgdEvent<number>) {
  let spacePerPixel = -1;
  const listener = () => {
    const value = context.camera.spacePerPixel * context.resolution;
    if (value === spacePerPixel) return;

    spacePerPixel = value;
    event.dispatch(value);
  };
  context.eventPaint.addListener(listener);
  return () => context.eventPaint.removeListener(listener);
}
