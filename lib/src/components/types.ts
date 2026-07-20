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
  /** shorthand: override the default "when" for right pins and labels */
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

/**
 * One coloured world-space point group for {@link PainterWorldOverlays}.
 *
 * `coordinates` is a flat xyz array: `[x0,y0,z0, x1,y1,z1, ...]`.
 * Synapses are configured separately via the small-circuit `synapses` prop.
 *
 * Why `id` + `origin` + `rotation`: interactive drag/rotate writes absolute
 * placement back to the host form (Obi-One electrode_locations).
 */
export interface MorphoViewerWorldOverlay {
  color: string;
  coordinates: Float32Array | number[];
  /**
   * Host identity (e.g. electrode block name). Required for interactive drag /
   * rotate so transforms can be written back to config. Contacts + origin tip
   * share one id so a single gesture moves the whole array.
   */
  id?: string;
  /** Semantic role within a shared `id` group. */
  kind?: "electrodes" | "origin" | string;
  /**
   * When `false`, this group is ignored by overlay picking. Default: interactive
   * when the viewer has `overlaysInteractive` enabled and `id` is set.
   */
  interactive?: boolean;
  /** Placement origin (rotation pivot), world XYZ. */
  origin?: [number, number, number];
  /** Absolute placement rotations in degrees (Obi-One ZXY: Rx, Ry, Rz). */
  rotation?: { x?: number; y?: number; z?: number };
}

/**
 * Fired when the user transforms an interactive overlay group.
 *
 * How hosts use it: ignore `phase: "move"` (viewer already paints live);
 * persist only on `"end"` to avoid React/config churn mid-drag.
 */
export interface MorphoViewerOverlayTransformEvent {
  id: string;
  origin: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  /** `move` during the gesture; `end` on pointer up. */
  phase: "move" | "end";
}

/**
 * Shared React props for small-circuit and somas-only overlay interaction.
 */
export interface PropsForOverlayInteraction {
  /**
   * Allow click-drag on overlays with an `id`:
   * - left-drag → translate (updates origin)
   * - right-drag / Alt-drag / Shift-drag → rotate (updates Rx / Rz; Ry preserved)
   *
   * Default `false` (display-only overlays).
   */
  overlaysInteractive?: boolean;
  /** Called when the user moves / rotates an interactive overlay. */
  onOverlayTransform?: (event: MorphoViewerOverlayTransformEvent) => void;
  /**
   * Host-controlled overlay highlight (e.g. selected electrode block name).
   * Matches {@link MorphoViewerWorldOverlay.id}. Cleared hover restores this.
   */
  highlightedOverlayId?: string | null;
}
