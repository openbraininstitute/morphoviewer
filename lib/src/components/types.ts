import type { TgdPainterGizmoOptions } from "@tolokoban/tgd";
import type React from "react";

/** when a scalebar element (pins on a side, labels) is shown */
export const ScalebarWhen = {
  Always: "always",
  Hover: "hover",
  Never: "never",
} as const;
export type TScalebarWhen = (typeof ScalebarWhen)[keyof typeof ScalebarWhen];

/** where the scalebar is anchored inside the viewer */
export const ScalebarPlacement = {
  Top: "top",
  Bottom: "bottom",
  Left: "left",
  Right: "right",
  TopLeft: "top-left",
  TopRight: "top-right",
  BottomLeft: "bottom-left",
  BottomRight: "bottom-right",
} as const;
export type TScalebarPlacement = (typeof ScalebarPlacement)[keyof typeof ScalebarPlacement];

/** layout axis of the scalebar */
export const ScalebarOrientation = {
  Horizontal: "horizontal",
  Vertical: "vertical",
} as const;
export type TScalebarOrientation = (typeof ScalebarOrientation)[keyof typeof ScalebarOrientation];

/** which side of the vertical holder something sits on */
export const ScalebarSide = {
  Left: "left",
  Right: "right",
} as const;
export type TScalebarSide = (typeof ScalebarSide)[keyof typeof ScalebarSide];

export interface ScalebarPinsConfig {
  /** when the pins extending LEFT of the holder are shown. Default `"always"` */
  left?: TScalebarWhen;
  /** when the pins extending RIGHT of the holder are shown. Default `"hover"` */
  right?: TScalebarWhen;
  /** length of a major pin, in pixels. Default `10` */
  majorLength?: number;
  /** length of a minor pin, in pixels. Default `5` */
  minorLength?: number;
  /** minor pins per major pin. Default `5` */
  minorPerMajor?: number;
}

export interface ScalebarLabelsConfig {
  /** when the value labels are shown. Default `"hover"` */
  show?: TScalebarWhen;
  /** which side of the holder labels sit on. Defaults to the viewport interior. */
  side?: TScalebarSide;
}

export interface ScalebarConfig {
  /** custom class — you then own the position/dimension via CSS */
  className?: string;
  /** measurement unit factor. Default `1e-6` (μm) */
  unit?: number;
  /** layout axis. Default `"horizontal"` */
  orientation?: TScalebarOrientation;
  /** anchor inside the viewer, default "bottom" (horizontal)/"bottom-left" (vertical) */
  placement?: TScalebarPlacement;
  /** offset from the anchored edges, in pixels */
  margin?: number | { x?: number; y?: number };
  /** raw style overrides, merged over the computed placement */
  style?: React.CSSProperties;
  /** pin (tick) configuration */
  pins?: ScalebarPinsConfig;
  /** value-label configuration */
  labels?: ScalebarLabelsConfig;
  /** shorthand: default "when" for hover-revealed content (right pins, labels) */
  reveal?: "hover" | "always";
  /** pin/label color, default `"#9ca3af"` */
  color?: string;
  /** line width of the pins/holder, default `1` */
  thickness?: number;
  /**
   * render the canvas at the display's device pixel ratio for crisp pins/labels
   * on HiDPI/Retina screens (heavier: more pixels to paint), default `false`
   * (renders at 1×)
   */
  hiDPI?: boolean;
}

export interface PropsForGizmo {
  /**
   * Display the axes controller gizmo.
   * - `false`: do not show the Gizmo
   * - `true`: show it with default options
   * - `Partial<object>`:
   *   - `alignX`: -1 meand left and +1 means right
   *   - `alignY`: -1 meand bottom and +1 means top
   *   - `size`: size of the Gizmo side in pixels
   *   - `margin`: margin from the borders of the viewer (in pixels)
   */
  gizmo?: boolean | TgdPainterGizmoOptions;
}

export interface PropsForScalebar {
  /**
   * If defined, a scalebar will be displayed.
   * - `false`: hidden.
   * - `true`: shown with defaults.
   * - `string`: a custom className (you own the position/dimension via CSS).
   * - {@link ScalebarConfig}: full control over orientation, placement, pins,
   *   labels and visuals.
   *
   * Default to `false`.
   */
  scalebar?: boolean | string | ScalebarConfig;
}
