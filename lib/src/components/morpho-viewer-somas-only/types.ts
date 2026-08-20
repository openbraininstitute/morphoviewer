import type { ArrayNumber3 } from "@tolokoban/tgd";

import type { PropsForSpikeReplay } from "@/spikes";
import type { ControlsLayoutProps } from "../controls-layout";
import type { MorphoViewerSignals } from "../signals";
import type {
  MorphoViewerWorldOverlay,
  PropsForGizmo,
  PropsForOverlayInteraction,
  PropsForScalebar,
} from "../types";

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
  PropsForScalebar &
  PropsForOverlayInteraction &
  PropsForSpikeReplay & {
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
     * World-space point overlays (electrodes, markers, …).
     * Drag/rotate when {@link PropsForOverlayInteraction.overlaysInteractive} is true.
     */
    overlays?: MorphoViewerWorldOverlay[];
    /** World-space radius multiplier for overlay spheres. */
    overlaysRadius?: number;
    /** Minimum on-screen size so distant electrodes stay pickable. */
    overlaysMinRadiusInPixels?: number;
    /**
     * Soma point-cloud opacity in `[0..1]`. Default `1` (opaque).
     * Translucent somas enable alpha blending without back-to-front sorting,
     * so draw-order artifacts are expected. Overlay electrode markers stay
     * fully opaque independently of this value.
     */
    neuronOpacity?: number;
    /**
     * imperative signal bus for camera reset and image capture. Create one with
     * `new MorphoViewerSignals()` and dispatch its signals to trigger actions;
     * `signals.snapshot.dispatch()` resolves to the captured image (the gizmo is
     * excluded, and the scalebar/host chrome are DOM overlays naturally left
     * out).
     */
    signals?: MorphoViewerSignals;
    onClose?(): void;
    onMinimize?(): void;
    controls?: ControlsLayoutProps["content"];
  };
