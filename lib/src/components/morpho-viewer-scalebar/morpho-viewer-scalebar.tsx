import React from "react";

import { classNames } from "@/utils";

import { type PropsForScalebar, type ScalebarConfig, ScalebarOrientation } from "../types";
import { paint } from "./painter";
import {
  normalizeScalebarConfig,
  resolveHorizontalScalebar,
  resolvePixelRatio,
  resolveUnitFactor,
  resolveVerticalScalebar,
} from "./resolve";

import type { TgdEvent } from "@tolokoban/tgd";

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
  const config = React.useMemo(() => normalizeScalebarConfig(className), [className]);
  const unit = resolveUnitFactor(config, unitProp);
  const pixelRatio = resolvePixelRatio(config);
  const spacePerPixel = useSpacePerPixel(spacePerPixelEvent);

  const sub = { config, unit, pixelRatio, spacePerPixel };
  if (config.orientation === ScalebarOrientation.Vertical) {
    return <VerticalScalebar {...sub} />;
  }
  return <HorizontalScalebar {...sub} />;
}

interface SubProps {
  config: ScalebarConfig;
  unit: number;
  pixelRatio: number;
  spacePerPixel: number;
}

function VerticalScalebar({ config, unit, pixelRatio, spacePerPixel }: SubProps) {
  const resolved = React.useMemo(() => resolveVerticalScalebar(config), [config]);
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const [hovered, setHovered] = React.useState(false);
  const effectiveHover = resolved.needsHover && hovered;

  const repaint = React.useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return;
    paint(
      canvas,
      spacePerPixel,
      unit,
      ScalebarOrientation.Vertical,
      resolved.paintParams(effectiveHover),
      pixelRatio
    );
  }, [spacePerPixel, unit, resolved, effectiveHover, pixelRatio]);

  useCanvasRepaint(ref, repaint, pixelRatio);

  const enter = resolved.needsHover ? () => setHovered(true) : undefined;
  const leave = resolved.needsHover ? () => setHovered(false) : undefined;
  const canvasStyle: React.CSSProperties = {
    color: resolved.color,
    fontSize: resolved.fontSize,
    width: "100%",
    height: "100%",
  };

  // full customization via className
  if (resolved.className) {
    return (
      <canvas
        ref={ref}
        onMouseEnter={enter}
        onMouseLeave={leave}
        className={classNames(resolved.className, styles.morphoViewerScalebar)}
        style={canvasStyle}
      ></canvas>
    );
  }

  let width = resolved.expandedWidth;
  if (resolved.widthAnimates) {
    width = effectiveHover ? resolved.expandedWidth : resolved.collapsedWidth;
  }

  return (
    <div
      className={styles.verticalContainer}
      style={{
        ...resolved.containerStyle,
        width,
        pointerEvents: resolved.needsHover ? "auto" : "none",
      }}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      <canvas ref={ref} className={styles.morphoViewerScalebar} style={canvasStyle}></canvas>
    </div>
  );
}

function HorizontalScalebar({ config, unit, pixelRatio, spacePerPixel }: SubProps) {
  const resolved = React.useMemo(() => resolveHorizontalScalebar(config), [config]);
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const repaint = React.useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return;
    paint(canvas, spacePerPixel, unit, ScalebarOrientation.Horizontal, undefined, pixelRatio);
  }, [spacePerPixel, unit, pixelRatio]);

  useCanvasRepaint(ref, repaint, pixelRatio);

  // use the default bottom class only when no inline placement/style was resolved
  // (otherwise the class's edges would fight the inline style)
  const className = resolved.className ?? (resolved.style ? undefined : styles.defaultLayout);
  return (
    <canvas
      ref={ref}
      className={classNames(className, styles.morphoViewerScalebar)}
      style={resolved.style}
    ></canvas>
  );
}

/** paint on mount, when `repaint` changes, and keep the canvas backing store in
 * sync with its CSS size. */
function useCanvasRepaint(
  ref: React.RefObject<HTMLCanvasElement | null>,
  repaint: () => void,
  pixelRatio: number
) {
  React.useEffect(() => {
    repaint();
  }, [repaint]);
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const dpr = pixelRatio > 0 ? pixelRatio : 1;
    const observer = new ResizeObserver(() => {
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      repaint();
    });
    observer.observe(canvas);
    return () => observer.unobserve(canvas);
  }, [ref, repaint, pixelRatio]);
}

function useSpacePerPixel(spacePerPixelEvent: TgdEvent<number>) {
  const [spacePerPixel, setSpacePerPixel] = React.useState(-1);
  React.useEffect(() => {
    spacePerPixelEvent.addListener(setSpacePerPixel);
    return () => spacePerPixelEvent.removeListener(setSpacePerPixel);
  }, [spacePerPixelEvent]);
  return spacePerPixel;
}
