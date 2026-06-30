import React from "react";

import { classNames } from "@/utils";

import { paint } from "./painter";

import type { TgdEvent } from "@tolokoban/tgd";
import type { PropsForScalebar } from "../types";

import styles from "./morpho-viewer-scalebar.module.css";

export interface MorphoViewerScalebarProps {
  className?: PropsForScalebar["scalebar"];
  spacePerPixelEvent: TgdEvent<number>;
  /**
   * Default to `1e-6` (μm)
   */
  unit?: number | PropsForScalebar["scalebar"];
}

export default function MorphoViewerScalebar({
  className,
  spacePerPixelEvent,
  unit: unitProp,
}: MorphoViewerScalebarProps) {
  const unit = resolveUnit(unitProp);
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
      className={classNames(resolveClassName(className), styles.morphoViewerScalebar)}
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

function resolveClassName(className: PropsForScalebar["scalebar"] | undefined): string | null {
  if (!className || typeof className === "boolean") return styles.defaultLayout;

  if (typeof className === "string") return className;

  return className.className ?? styles.defaultLayout;
}

function resolveUnit(
  unitProp: string | number | boolean | { className?: string; unit?: number } | undefined
) {
  if (!unitProp || typeof unitProp === "string" || typeof unitProp === "boolean") return 1e-6;

  if (typeof unitProp === "number") return unitProp;

  return unitProp.unit ?? 1e-6;
}
