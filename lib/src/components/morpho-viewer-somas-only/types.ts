import type { ArrayNumber3 } from "@tolokoban/tgd";
import type { ControlsLayoutProps } from "../controls-layout";
import type { PropsForGizmo, PropsForScalebar } from "../types";

export interface MorphoViewerCellInfo {
  morphologyId: string;
  position: ArrayNumber3;
  /**
   * Optional per-soma color, as any CSS color string.
   *
   * when at least one cell defines a color, the point cloud is colored per
   * cell: distinct colors become the columns of a palette and each soma is
   * mapped to its column, while ambient occlusion keeps shading depth
   *
   * when no cell defines a color, the viewer falls back to the default blue
   * depth-shaded palette
   *
   * for continuous properties, quantize the values into a bounded set of
   * colors (e.g. sampling a gradient into up to a few hundred stops) so the
   * palette stays small.
   */
  color?: string;
}

export type MorphoViewerSomasOnlyProps = PropsForGizmo &
  PropsForScalebar & {
    className?: string;
    somaRadius?: number;
    cellInfos: MorphoViewerCellInfo[];
    cameraType?: "orthographic" | "perspective";
    /**
     * background (canvas clear) color, as any CSS color string
     * defaults to black to preserve legacy behavior
     */
    backgroundColor?: string;
    /**
     * change this value (e.g. increment a counter) to reset the camera to fit
     * the bounding box. Lets host apps trigger a reset from custom controls
     */
    resetCameraSignal?: unknown;
    onClose?(): void;
    onMinimize?(): void;
    controls?: ControlsLayoutProps["content"];
  };
