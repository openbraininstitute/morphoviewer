import type { ControlsLayoutProps } from "../controls-layout";
import type { MorphoViewerTree, MorphoViewerTreeItemType } from "../morpho-viewer-simul";
import type { MorphoViewerSignals } from "../signals";
import type {
  MorphoViewerWorldOverlay,
  PropsForGizmo,
  PropsForOverlayInteraction,
  PropsForScalebar,
} from "../types";

export interface SectionColors {
  soma: string;
  axon: string;
  myelin: string;
  apicalDendrite: string;
  basalDendrite: string;
  unknown: string;
}

export interface MorphoViewerSmallCircuitCell {
  id: string;
  center: [x: number, y: number, z: number];
  orientation: [x: number, y: number, z: number, w: number];
  somaRadius: number;
  color?: string | SectionColors;
}

/** One point on one neurite, as resolved from a click in the 3D view. */
export interface MorphoViewerMorphologyLocationPick {
  /** The cell that was clicked — a circuit location is only meaningful together with it. */
  cell: MorphoViewerSmallCircuitCell;
  /** Section identifier within the cell's own tree, useful for labels and highlighting. */
  sectionName: string;
  /**
   * SONATA global section id, when the morphology source supplied one.
   *
   * `undefined` means the click cannot be stored as a morphology location: the tree came from
   * a source that could not produce SONATA numbering. Hosts should treat that as "not
   * pickable" rather than substituting a section id of their own.
   */
  sonataSectionId?: number;
  /**
   * What kind of section this is — soma, axon, basal or apical dendrite.
   *
   * A section id alone tells a user nothing; the type is what makes a location legible.
   * Reported as the enum so the host owns the wording.
   */
  sectionType?: MorphoViewerTreeItemType;
  /** Normalized position along the section, `0..1`. */
  offset: number;
  /**
   * The already-selected marker this click landed on, when it landed on one.
   *
   * Lets a host treat a second click as "remove" without having to re-derive which stored
   * location the click meant — matching on a rounded offset would be guesswork.
   */
  existingMarker?: MorphoViewerMorphologyLocationMarker;
}

/** A location to draw a marker for, in the same terms a pick reports. */
export interface MorphoViewerMorphologyLocationMarker {
  cellId: string;
  sectionName: string;
  offset: number;
  /** SONATA section id, carried through so a hover can name the location the config stores. */
  sonataSectionId?: number;
  /**
   * What kind of section this is. Filled in by the viewer when a marker is resolved, so hosts
   * need not know it up front — a config stores only a section id and an offset.
   */
  sectionType?: MorphoViewerTreeItemType;
  /** Overrides {@link MorphoViewerMorphologyLocationSelection.color} for this marker. */
  color?: string;
}

/** What is under the pointer, with where to anchor a popover. */
export interface MorphoViewerMorphologyLocationHover extends MorphoViewerMorphologyLocationMarker {
  /**
   * Whether this is an already-selected location or a spot that clicking would add.
   *
   * Both are reported so the pointer can preview *before* committing: without it a user has
   * to click and then undo to find out what a spot resolves to.
   */
  kind: "selected" | "preview";
  /**
   * Position as fractions of the canvas width and height, both `0..1`.
   *
   * Normalized rather than pixels so a host can position with percentages and stay correct
   * across resizes and device-pixel-ratio changes.
   */
  screen: { x: number; y: number };
}

/** A selected location together with where it currently sits on screen. */
export interface MorphoViewerMorphologyLocationLabel {
  marker: MorphoViewerMorphologyLocationMarker;
  /** Fractions of the canvas width and height, both `0..1`. */
  screen: { x: number; y: number };
  /** False when the point is behind the camera, so hosts can hide the label. */
  visible: boolean;
}

/**
 * Turns the viewer into a location picker: clicks resolve to a point on a neurite, and
 * `selected` is drawn as markers.
 *
 * Omit it and the viewer behaves exactly as before — no extra pick buffer is built and clicks
 * only report which cell was hit.
 */
export interface MorphoViewerMorphologyLocationSelection {
  selected: MorphoViewerMorphologyLocationMarker[];
  /** Leave it out for read-only markers: no picking, no hand cursor, no preview. */
  onPick?(this: void, pick: MorphoViewerMorphologyLocationPick): void;
  /**
   * Called with the marker under the pointer, and with `null` on leaving it.
   *
   * The viewer reports the hover and leaves the popover to the host: a DOM element inherits
   * the app's typography and theming, and stays crisp, where drawing it into the canvas would
   * not.
   */
  onHover?(this: void, hover: MorphoViewerMorphologyLocationHover | null): void;
  /**
   * Called with every selected location and its current screen position, on each repaint.
   *
   * For labels that stay pinned to their point as the camera orbits. Only wired up when a
   * host asks for it, because it fires on every frame of a drag; hosts should coalesce.
   */
  onLabelsChange?(this: void, labels: MorphoViewerMorphologyLocationLabel[]): void;
  /** Marker colour. Defaults to a warm highlight that reads against the neuron palette. */
  color?: string;
  /**
   * Marker radius in world units. Defaults to `DEFAULT_LOCATION_MARKER_RADIUS`.
   *
   * Host-controlled because the right size depends on the circuit: a few microns reads well
   * on one cell and vanishes across a microcircuit. A pixel floor keeps markers visible
   * whatever this is set to, so the slider changes how prominent they are, not whether they
   * can be seen at all.
   */
  radius?: number;
  /**
   * Section types that get the hand cursor. Clicks are still reported for all of them.
   * Omit to treat every section as pickable.
   */
  pickableSectionTypes?: readonly MorphoViewerTreeItemType[];
}

/**
 * A spike train flattened against the `circuit` array.
 *
 * Parallel typed arrays rather than objects: a region-scale recording is
 * millions of spikes, and the viewer only ever reads them in index order.
 */
export interface MorphoViewerSmallCircuitSpikes {
  /** For each spike, the index in `circuit` of the cell that fired. */
  cellIndices: Uint32Array;
  /** For each spike, when it fired, in milliseconds. Must be ascending. */
  times: Float32Array;
  /** Start of the recording. Not necessarily `times[0]` — a cell may be silent. */
  timeMinInMs: number;
  timeMaxInMs: number;
}

export type MorphoViewerSmallCircuitCellData = {
  type: "tree";
  data: MorphoViewerTree;
};

export type MorphoViewerSmallCircuitProps = PropsForGizmo &
  PropsForScalebar &
  PropsForOverlayInteraction & {
    className?: string;
    backgroundColor?: string;
    circuit: MorphoViewerSmallCircuitCell[];
    /**
     * World-space point overlays (electrodes, markers, …).
     * Independent from {@link synapses}. Drag/rotate when
     * {@link PropsForOverlayInteraction.overlaysInteractive} is true.
     */
    overlays?: MorphoViewerWorldOverlay[];
    /** World-space radius multiplier for overlay spheres. */
    overlaysRadius?: number;
    /** Minimum on-screen size so distant electrodes stay pickable. */
    overlaysMinRadiusInPixels?: number;
    /**
     * Synapse point groups (colour + flat xyz coordinates).
     * Independent from {@link overlays}.
     */
    synapses?: Array<{
      color: string;
      coordinates: Float32Array | number[];
    }>;
    /**
     * Morph the cells into a dendrogram: branching across x, path distance up y.
     *
     * The same segments in the same order as the morphology, so a branch stays traceable through
     * the transition and picking keeps working in either view.
     *
     * Meant for a single cell. Each cell charts itself in its own frame, then keeps its
     * orientation and soma position, so a circuit becomes a set of flat charts, each tilted
     * differently and spread over the tissue.
     *
     * Only {@link locationSelection} markers travel with the morph. {@link synapses} and
     * {@link overlays} are given in the file's own coordinates, so they stay where the 3D
     * geometry was while the neurites leave for the chart.
     */
    dendrogram?: boolean;
    synapsesRadius?: number;
    synapsesMinRadiusInPixels?: number;
    /** Called with the camera zoom when it changes, the user's own scrolling included. */
    onZoomChange?: (zoom: number) => void;
    /**
     * Draw each soma as one fitted sphere rather than the contour chain the file records.
     *
     * Default `false`. Leave it off wherever {@link synapses} are drawn: those positions are
     * recorded against the file's own geometry, so replacing the soma moves the surface out
     * from under them. Meant for a lone neuron shown without a circuit around it.
     */
    somaAsSphere?: boolean;
    /**
     * Neuron mesh opacity in `[0..1]`. Default `1` (opaque).
     * Translucent neurons enable alpha blending without back-to-front sorting,
     * so draw-order artifacts are expected. Overlay markers stay fully opaque
     * (`blend: "off"`) and do not inherit this alpha.
     */
    neuronOpacity?: number;
    /**
     * Ids of the cells we want to highlight.
     */
    highlightedCellIds?: string[];
    /**
     * Spikes to replay over the circuit. Omit and the viewer behaves exactly as
     * before: no clock runs and no cell ever glows on its own.
     */
    spikes?: MorphoViewerSmallCircuitSpikes;
    /**
     * Where the playhead is, in milliseconds. Setting it seeks.
     *
     * Only read when it changes, so a host is free to leave it alone during
     * playback and pass it only when the user scrubs.
     */
    spikeTime?: number;
    /**
     * The playhead on every painted frame.
     *
     * Fires at frame rate on purpose — a linked view has to follow the replay,
     * not a throttled copy of it. Hosts that put this into React state should
     * throttle there.
     */
    onSpikeTimeChange?(timeInMs: number): void;
    spikePlaying?: boolean;
    /** Also fires with `false` when playback reaches the end of the recording. */
    onSpikePlayingChange?(playing: boolean): void;
    /**
     * Playback rate as simulated milliseconds per wall-clock second.
     * Default `100`, so a one-second simulation plays in ten seconds.
     */
    spikeSpeed?: number;
    /**
     * How long a spike stays visible, as the wall-clock time it takes to fade
     * to `1/e` of full brightness. Default `0.35`.
     *
     * In wall-clock rather than simulated time so that a flash lasts the same
     * on screen whatever {@link spikeSpeed} is — at 100× the speed a spike
     * would otherwise be gone before a frame could show it.
     */
    spikeAfterglowInSeconds?: number;
    onCellHover?(cell: MorphoViewerSmallCircuitCell | undefined): void;
    onCellClick?(cell: MorphoViewerSmallCircuitCell | undefined): void;
    /**
     * Turn clicks into morphology locations and draw the current selection.
     *
     * Omit to keep the viewer exactly as it was: no second pick buffer is built, and clicks
     * continue to report only which cell was hit.
     */
    locationSelection?: MorphoViewerMorphologyLocationSelection;
    onClose?(): void;
    onMinimize?(): void;
    /**
     * A function to load a cell.
     * @param id Unique identifier of the cell from attribute `circuit`.
     */
    loadCell(id: string): Promise<MorphoViewerSmallCircuitCellData | null>;
    /**
     * This callback is called when the loading starts (with a value of __0__),
     * then every time a cell is loaded.
     *
     * @param progress Percentage of loaded cells so far. Between `0.0` and `1.0`.
     */
    onLoadProgress?(progress: number): void;
    controls?: ControlsLayoutProps["content"];
    /**
     * Specify if you want more debug in the console.
     *
     * Default to `false`.
     */
    verbose?: boolean;
    /**
     * imperative signal bus for camera reset and image capture. Create one with
     * `new MorphoViewerSignals()` and dispatch its signals to trigger actions;
     * `signals.snapshot.dispatch()` resolves to the captured image (the gizmo is
     * excluded, and the scalebar/host chrome are DOM overlays naturally left
     * out).
     */
    signals?: MorphoViewerSignals;
  };
