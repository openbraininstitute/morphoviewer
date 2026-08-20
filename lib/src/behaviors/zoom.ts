import type { TgdContext, TgdEvent } from "@tolokoban/tgd";

/** Dispatch the camera zoom when it changes. Watched on paint, like the scale. */
export function watchZoom(context: TgdContext, event: TgdEvent<number>) {
  let zoom = Number.NaN;
  const listener = () => {
    const value = context.camera.zoom;
    if (value === zoom) return;

    zoom = value;
    event.dispatch(value);
  };
  context.eventPaint.addListener(listener);
  return () => context.eventPaint.removeListener(listener);
}
