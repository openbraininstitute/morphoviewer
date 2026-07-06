import {
  type ScalebarConfig,
  ScalebarSide,
  ScalebarWhen,
  type TScalebarSide,
  type TScalebarWhen,
} from "../types";

import type React from "react";

/** everything the vertical painter needs for the current hover state */
export interface VerticalPaintParams {
  /** which viewport edge the holder hugs (governs the baseline x) */
  anchor: TScalebarSide;
  /** fixed distance (px) of the baseline from the anchored edge */
  outerReserve: number;
  majorLength: number;
  minorLength: number;
  minorPerMajor: number;
  /** pins extending left of the holder are drawn */
  leftPins: boolean;
  /** pins extending right of the holder are drawn */
  rightPins: boolean;
  /** value labels are drawn */
  labels: boolean;
  labelSide: TScalebarSide;
  color: string;
  thickness: number;
}

export interface ResolvedVerticalScalebar {
  /** custom class (escape hatch) — when set, the consumer owns layout */
  className?: string;
  /** computed container style (position + size). Empty when `className` is set */
  containerStyle: React.CSSProperties;
  collapsedWidth: number;
  expandedWidth: number;
  /** true when hovering changes the width (needs the expand transition) */
  widthAnimates: boolean;
  /** true when any element is hover-gated (needs pointer events + repaint) */
  needsHover: boolean;
  color: string;
  fontSize: number;
  /** painter params for a given hover state */
  paintParams(hovered: boolean): VerticalPaintParams;
}

const DEFAULT_MAJOR_LENGTH = 10;
const DEFAULT_MINOR_LENGTH = 5;
const DEFAULT_MINOR_PER_MAJOR = 5;
const DEFAULT_COLOR = "#9ca3af";
const DEFAULT_THICKNESS = 1;
const DEFAULT_MARGIN_X = 2;
const DEFAULT_MARGIN_Y = 12;
const DEFAULT_HEIGHT = "min(180px, 42%)";
const FONT_SIZE = 10;
const LABEL_GAP = 4;
/** reserved width (px) for a value label at the ruler font size */
const LABEL_RESERVE = 40;

/** normalize the `scalebar` prop (boolean | string | object) into a config */
export function normalizeScalebarConfig(
  value: boolean | string | ScalebarConfig | undefined
): ScalebarConfig {
  if (!value || value === true) return {};
  if (typeof value === "string") return { className: value };
  return value;
}

export function resolveUnitFactor(config: ScalebarConfig, unitProp?: unknown): number {
  return config.unit ?? (typeof unitProp === "number" ? unitProp : undefined) ?? 1e-6;
}

/** device pixel ratio to render at: the display DPR when `hiDPI` is on, else 1 */
export function resolvePixelRatio(config: ScalebarConfig): number {
  if (!config.hiDPI) return 1;
  return Math.max(1, globalThis.devicePixelRatio || 1);
}

function visible(when: TScalebarWhen, hovered: boolean): boolean {
  if (when === ScalebarWhen.Always) return true;
  if (when === ScalebarWhen.Never) return false;
  return hovered;
}

function marginXY(config: ScalebarConfig): { x: number; y: number } {
  const m = config.margin;
  if (typeof m === "number") return { x: m, y: m };
  return { x: m?.x ?? DEFAULT_MARGIN_X, y: m?.y ?? DEFAULT_MARGIN_Y };
}

/** extent (px) taken by one side of the holder given pin/label visibility. */
function sideExtent(pinsShown: boolean, labelsShown: boolean, majorLength: number): number {
  const pinExtent = pinsShown ? majorLength : 0;
  if (!labelsShown) return pinExtent;
  const labelStart = (pinsShown ? majorLength : 0) + LABEL_GAP;
  return Math.max(pinExtent, labelStart + LABEL_RESERVE);
}

/** resolve the vertical ruler config into a layout + painter-params factory. */
export function resolveVerticalScalebar(config: ScalebarConfig): ResolvedVerticalScalebar {
  const placement = config.placement ?? "bottom-left";
  const anchor: TScalebarSide = placement.includes("right")
    ? ScalebarSide.Right
    : ScalebarSide.Left;
  const innerSide: TScalebarSide =
    anchor === ScalebarSide.Left ? ScalebarSide.Right : ScalebarSide.Left;

  const reveal = config.reveal;
  const pinsLeftWhen = config.pins?.left ?? ScalebarWhen.Always;
  const pinsRightWhen = config.pins?.right ?? reveal ?? ScalebarWhen.Hover;
  const labelsWhen = config.labels?.show ?? reveal ?? ScalebarWhen.Hover;
  const labelSide = config.labels?.side ?? innerSide;

  const majorLength = config.pins?.majorLength ?? DEFAULT_MAJOR_LENGTH;
  const minorLength = config.pins?.minorLength ?? DEFAULT_MINOR_LENGTH;
  const minorPerMajor = config.pins?.minorPerMajor ?? DEFAULT_MINOR_PER_MAJOR;
  const color = config.color ?? DEFAULT_COLOR;
  const thickness = config.thickness ?? DEFAULT_THICKNESS;

  // map physical sides to inner/outer relative to the anchored edge
  const whenForSide = (side: TScalebarSide) =>
    side === ScalebarSide.Left ? pinsLeftWhen : pinsRightWhen;
  const outerWhen = whenForSide(anchor);
  const innerWhen = whenForSide(innerSide);
  const labelsOnOuter = labelSide === anchor;
  const labelsOnInner = labelSide === innerSide;

  // outer reserve is fixed (keeps the baseline from moving): reserve for the
  // maximal outer content so the holder never shifts.
  const outerReserve = Math.max(
    majorLength,
    sideExtent(outerWhen !== ScalebarWhen.Never, labelsOnOuter, majorLength)
  );

  const innerExtent = (hovered: boolean) =>
    sideExtent(
      visible(innerWhen, hovered),
      labelsOnInner && visible(labelsWhen, hovered),
      majorLength
    );

  const width = (hovered: boolean) => outerReserve + innerExtent(hovered) + 1;
  const collapsedWidth = Math.ceil(width(false));
  const expandedWidth = Math.ceil(width(true));

  const needsHover =
    pinsLeftWhen === ScalebarWhen.Hover ||
    pinsRightWhen === ScalebarWhen.Hover ||
    labelsWhen === ScalebarWhen.Hover;

  const { x: mx, y: my } = marginXY(config);
  const containerStyle: React.CSSProperties = config.className
    ? {}
    : {
        position: "absolute",
        height: DEFAULT_HEIGHT,
        ...(anchor === ScalebarSide.Left ? { left: mx } : { right: mx }),
        ...verticalEdgeStyle(placement, my),
        ...config.style,
      };

  return {
    className: config.className,
    containerStyle,
    collapsedWidth,
    expandedWidth,
    widthAnimates: collapsedWidth !== expandedWidth,
    needsHover,
    color,
    fontSize: FONT_SIZE,
    paintParams(hovered: boolean): VerticalPaintParams {
      return {
        anchor,
        outerReserve,
        majorLength,
        minorLength,
        minorPerMajor,
        leftPins: visible(pinsLeftWhen, hovered),
        rightPins: visible(pinsRightWhen, hovered),
        labels: visible(labelsWhen, hovered),
        labelSide,
        color,
        thickness,
      };
    },
  };
}

function verticalEdgeStyle(placement: string, my: number): React.CSSProperties {
  if (placement.startsWith("top")) return { top: my };
  if (placement.startsWith("bottom")) return { bottom: my };
  // pure 'left'/'right': vertically centered
  return { top: "50%", transform: "translateY(-50%)" };
}

/** space (px) reserved on the far side of the horizontal bar for other controls */
const HORIZONTAL_FAR_RESERVE = 128;

export interface ResolvedHorizontalScalebar {
  /** custom class (escape hatch), or the built-in default class */
  className?: string;
  /** computed container style when a placement/style/margin was requested */
  style?: React.CSSProperties;
}

/**
 * resolve the horizontal bar. With no placement/style/margin it keeps the
 * built-in bottom layout (default class); otherwise it positions the bar via an
 * inline style honoring `placement` (top/bottom edge) and margins
 */
export function resolveHorizontalScalebar(config: ScalebarConfig): ResolvedHorizontalScalebar {
  if (config.className) return { className: config.className };
  if (!config.placement && !config.style && config.margin === undefined) return {};

  const { x: mx, y: my } = marginXY(config);
  const placement = config.placement ?? "bottom";
  const style: React.CSSProperties = {
    position: "absolute",
    height: "1.4em",
    left: mx,
    right: mx + HORIZONTAL_FAR_RESERVE,
    pointerEvents: "none",
    ...(placement.startsWith("top") ? { top: my } : { bottom: my }),
    ...config.style,
  };
  return { style };
}
