import React from "react";

import { classNames } from "@/utils";

import { paint } from "./painter";

import type { TgdEvent } from "@tolokoban/tgd";

import styles from "./morpho-viewer-scalebar.module.css";

export interface MorphoViewerScalebarProps {
  className?: string | boolean;
  spacePerPixelEvent: TgdEvent<number>;
  /**
   * Default to `1e-6` (μm)
   */
  unit?: number;
}

export default function MorphoViewerScalebar({
  className,
  spacePerPixelEvent,
  unit = 1e-6,
}: MorphoViewerScalebarProps) {
  const spacePerPixel = useSpacePerPixel(spacePerPixelEvent);
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    paint(canvas, spacePerPixel, unit);
  }, [spacePerPixel, unit]);
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      paint(canvas, spacePerPixel, unit);
    });
    observer.observe(canvas);
    return () => observer.unobserve(canvas);
  }, [spacePerPixel, unit]);

  return (
    <canvas
      ref={ref}
      className={classNames(
        typeof className === "string" ? className : styles.defaultLayout,
        styles.morphoViewerScalebar
      )}
    ></canvas>
  );
}

function useSpacePerPixel(spacePerPixelEvent: TgdEvent<number>) {
  const [spacePerPixel, setSpacePerPixel] = React.useState(-1);
  React.useEffect(() => {
    spacePerPixelEvent.addListener(setSpacePerPixel);
    return () => spacePerPixelEvent.removeListener(setSpacePerPixel);
  }, [spacePerPixelEvent]);
  return spacePerPixel;
}
