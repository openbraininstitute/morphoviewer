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

/**
 * Per-soma colour as the GPU wants it: a small palette, and the column each
 * soma takes from it.
 *
 * The alternative — a colour string on every {@link MorphoViewerCellInfo} — is
 * fine at the scale a morphology viewer works at, and impossible at the scale
 * a soma cloud does: it makes recolouring a circuit rebuild an object per
 * soma, so a viewer holding four million of them spends over a second and a
 * gigabyte of garbage to change which population is highlighted. Given this
 * instead, the same change is one buffer write, and the geometry the host
 * passes never has to be rebuilt at all.
 *
 * Overrides {@link MorphoViewerCellInfo.color} wherever it is supplied.
 */
export interface MorphoViewerCellColors {
  /**
   * Distinct colours, as any CSS colour string, one per palette column, plus
   * two sentinels:
   *
   * - `null` is the viewer's own occlusion ramp, for somas the host has
   *   nothing to say about — light where a soma stands exposed, dark where it
   *   is buried. Empty for that ramp and nothing else, which is also what the
   *   viewer draws when nothing is coloured at all.
   * - `false` is not drawn at all. The somas are still there — still placed,
   *   still counted, still indexed the same — so hiding a population is the
   *   same buffer write any other recolour is, rather than new geometry and
   *   the scene rebuild that comes with it.
   *
   * Keep it small: it becomes a texture one pixel wide per colour. For a
   * continuous property, quantize into a bounded set of stops.
   */
  palette: (string | null | false)[];
  /**
   * The palette column each soma takes, one entry per soma in the order the
   * geometry was given ({@link MorphoViewerSomasOnlyProps.positions} or
   * {@link MorphoViewerSomasOnlyProps.cellInfos}).
   * Out-of-range entries sample the nearest column.
   */
  columnByCell: Uint16Array;
}

export type MorphoViewerSomasOnlyProps = PropsForGizmo &
  PropsForScalebar &
  PropsForOverlayInteraction &
  PropsForSpikeReplay & {
    className?: string;
    somaRadius?: number;
    /**
     * Soma positions as one flat `[x, y, z, ...]` array, a triple per soma.
     *
     * The typed-array way to say what {@link cellInfos} says with an object
     * per soma: a host that already holds flat arrays hands them over as they
     * are, instead of building millions of objects for the viewer to walk
     * once. Wins over `cellInfos` wherever both are given, and
     * {@link cellColors} is the only colour source on this path.
     *
     * A new array is a new scene, camera reset included. Identity is the
     * whole comparison — no walk over the floats — so a host that recolours
     * hands back the same array and moves `cellColors` alone.
     */
    positions?: Float32Array;
    cellInfos?: MorphoViewerCellInfo[];
    /**
     * Per-soma colour, overriding {@link MorphoViewerCellInfo.color}.
     *
     * Changing this alone repaints the cloud in place: the positions, the
     * bounding box, the camera and the ambient occlusion all stand. Changing
     * `cellInfos` or `positions` does not — that is a new scene — so a host
     * that recolours often wants to hand the same geometry array back every
     * time and move only this.
     */
    cellColors?: MorphoViewerCellColors;
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
    /**
     * A click that landed on a soma, reported as that soma's index in
     * {@link MorphoViewerSomasOnlyProps.positions} /
     * {@link MorphoViewerSomasOnlyProps.cellInfos}. A tap that orbited, dragged
     * an overlay, or hit empty background reports nothing.
     *
     * Picking draws the cloud once more into a hidden ID buffer — built on the
     * first click and only while this callback is set, since it carries its own
     * copy of every position — so a viewer without it pays nothing. Somas a
     * `false` palette column leaves undrawn are left out of it too, so they
     * neither answer a click nor swallow one meant for a soma behind them.
     */
    onCellClick?(cellIndex: number): void;
    onClose?(): void;
    onMinimize?(): void;
    controls?: ControlsLayoutProps["content"];
  };
