import {
  type ArrayNumber3,
  TgdBoundingBox,
  TgdCameraOrthographic,
  TgdColor,
  TgdContext,
  TgdEvent,
  type TgdInputPointerEventMove,
  type TgdInputPointerEventTap,
  TgdMat4,
  TgdPainterClear,
  type TgdPainterGizmoOptions,
  TgdPainterGroup,
  TgdPainterState,
  TgdQuat,
  type TgdTexture2D,
  TgdTransfo,
  TgdValueWaitable,
  TgdVec4,
  webglBlendGet,
  webglBlendSet,
  webglPresetBlend,
} from "@tolokoban/tgd";
import React from "react";

import { watchSpacePerPixel } from "@/behaviors";
import { computeSectionOffset } from "@/morphology-picking";
import { PainterGizmo } from "@/painters/gizmo";
import { OverlayInteractionController } from "@/painters/overlay-interaction";
import { OverlaySurface } from "@/painters/overlay-surface";
import { CacheLRU } from "@/tools/cache-lru";

import { CameraManager } from "./camera";
import { OffscreenPainter, SegmentOffscreenPainter } from "./offscreen-painter";
import { PainterCell, PainterCellFlat } from "./painter-cell";
import { PainterLocationMarkers } from "./painter-location-markers";
import { PainterSynapses } from "./painter-synapses";

import type { PainterWorldOverlays } from "@/painters/world-overlays";
import type {
  MorphoViewerSignalCameraResetOptions,
  MorphoViewerSignalSnapshotOptions,
} from "../../signals";
import type { MorphoViewerOverlayTransformEvent, MorphoViewerWorldOverlay } from "../../types";
import type {
  MorphoViewerMorphologyLocationHover,
  MorphoViewerMorphologyLocationLabel,
  MorphoViewerMorphologyLocationMarker,
  MorphoViewerMorphologyLocationPick,
  MorphoViewerSmallCircuitCell,
  MorphoViewerSmallCircuitCellData,
  MorphoViewerSmallCircuitProps,
} from "..";

interface Framebuffer {
  textureColor0?: TgdTexture2D;
  delete(): void;
}

/** Warm amber, chosen to stay legible against the blue/violet neuron palette. */
const DEFAULT_LOCATION_MARKER_COLOR = "#ef9f27";
/** Cheap enough for hover, coarse enough that thin neurites fall between its pixels. */
const CELL_PICKING_RESOLUTION_DIVIDER = 4;
/** Matches the segment buffer, so both agree on what was hit. */
const LOCATION_PICKING_RESOLUTION_DIVIDER = 2;
/** Larger than a synapse: there are a handful of these and they are the point of the view. */
export const DEFAULT_LOCATION_MARKER_RADIUS = 3;
const LOCATION_MARKER_MIN_RADIUS_IN_PIXELS = 6;
/** How far a click may miss a neurite and still count. Small enough that background misses. */
const LOCATION_PICK_SEARCH_IN_PIXELS = 4;
/** Slightly wider than the marker, so the popover does not flicker at its edge. */
const LOCATION_HOVER_TOLERANCE_IN_PIXELS = 9;
/** Tighter than the click search, so the preview does not latch onto neighbouring branches. */
const LOCATION_HOVER_SEARCH_IN_PIXELS = 2;

export class PainterManager {
  public readonly eventRestingPosition = new TgdEvent<boolean>();
  public readonly eventCellHover = new TgdEvent<MorphoViewerSmallCircuitCell | undefined>();
  public readonly eventCellClick = new TgdEvent<MorphoViewerSmallCircuitCell | undefined>();
  /** A click resolved down to one point on one neurite. Only fires while picking is enabled. */
  public readonly eventLocationPick = new TgdEvent<MorphoViewerMorphologyLocationPick>();
  /** The selected location under the pointer, or `null` on leaving one. */
  public readonly eventLocationHover = new TgdEvent<MorphoViewerMorphologyLocationHover | null>();
  /**
   * Every selected location and where it currently sits on screen.
   *
   * Fires on each repaint so labels can stay pinned to their point while the camera orbits.
   * Only computed when a host has asked for it.
   */
  public readonly eventLocationLabels = new TgdEvent<MorphoViewerMorphologyLocationLabel[]>();
  /**
   * Dispatch the `spacePerPixel`.
   */
  public readonly eventScalebar = new TgdEvent<number>();
  /**
   * This callback is called when the loading starts (with a value of __0__),
   * then every time a cell is loaded.
   *
   * @param progress Percentage of loaded cells so far. Between `0.0` and `1.0`.
   */
  public onLoadProgress?(progress: number): void;

  /**
   * Used for the highlights, because we don't want to render at full resolution
   * something that will be blurry anyway,
   */
  private readonly viewportMatchingScale = 0.2;
  private _canvas: HTMLCanvasElement | null = null;
  private _background = "#000";
  private readonly backgroundColor = new TgdColor(0, 0, 0, 1);
  private readonly context = new TgdValueWaitable<TgdContext>();
  private cameraManager: CameraManager | null = null;
  private painterClear: TgdPainterClear | null = null;
  private offscreen: OffscreenPainter | null = null;
  private segmentOffscreen: SegmentOffscreenPainter | null = null;
  /** Built lazily: the extra pick buffer only exists while a host is asking for locations. */
  private _locationPickingEnabled = false;
  private _highlightedCellIds: string[] = [];
  private hoveredCellId: string | undefined = "";
  private readonly groupCells = new TgdPainterGroup({ name: "GroupCell" });
  private circuit: MorphoViewerSmallCircuitCell[] = [];
  private readonly cellsForHighlights = new Map<string, PainterCell>();
  private readonly groupHighlightedCells = new TgdPainterGroup({
    name: "groupHighlightedCells",
  });
  private loadCell: null | ((id: string) => Promise<MorphoViewerSmallCircuitCellData | null>) =
    null;
  /**
   * Number of cells in the current circuit.
   */
  private cellCountTotal = 0;
  /**
   * Number of cells loaded with full morphology.
   * If the load fails, this number will be incremented anyway.
   */
  private cellCountLoaded = 0;
  private framebufferCircuit: Framebuffer | null = null;
  private textureFramebufferCircuit: TgdTexture2D | null = null;
  private framebufferHighlightedCells: Framebuffer | null = null;
  private framebufferBlur: Framebuffer | null = null;
  private loadedCellsCache = new CacheLRU<Promise<MorphoViewerSmallCircuitCellData | null>>(24);
  private circuitSignature = "";
  /** when false, the next circuit update rebuilds cells but keeps the camera
   * (used for recolor, where only cell colors change) */
  private fitCameraOnUpdate = true;
  private placementSignature = "";
  private bbox = new TgdBoundingBox();
  private _verbose = false;
  private readonly painterGizmo = new PainterGizmo();
  private painterOverlays: PainterWorldOverlays | null = null;
  private painterSynapses: PainterSynapses | null = null;
  private painterLocationMarkers: PainterLocationMarkers | null = null;
  private _locationMarkers: MorphoViewerMorphologyLocationMarker[] = [];
  private _locationMarkerColor = DEFAULT_LOCATION_MARKER_COLOR;
  private _locationMarkerRadius = DEFAULT_LOCATION_MARKER_RADIUS;
  /**
   * Each marker that could be placed, with where it ended up.
   *
   * One list rather than two parallel arrays: markers whose cell has not loaded are skipped,
   * so a separate positions array would fall out of step with the markers it indexes.
   */
  private resolvedLocationMarkers: Array<{
    marker: MorphoViewerMorphologyLocationMarker;
    point: ArrayNumber3;
  }> = [];
  private hoveredLocationIndex: number | null = null;
  /** Last previewed spot, so the popover is not re-dispatched on every pixel of travel. */
  private previewedLocationKey: string | null = null;
  /** Off unless a host subscribes: projecting on every frame is wasted work otherwise. */
  private _locationLabelsEnabled = false;
  private readonly cellPainters: PainterCell[] = [];
  private _dendrogramMode = false;
  private dendrogramMix = 0;
  private dendrogramAnimation: number | null = null;
  /** Transparent electrode canvas — painted without re-drawing morphologies. */
  private readonly overlaySurface = new OverlaySurface();
  private _overlayCanvas: HTMLCanvasElement | null = null;
  private overlayInteraction: OverlayInteractionController | null = null;
  private _overlays: MorphoViewerWorldOverlay[] = [];
  private _overlaysRadius = 5;
  private _overlaysMinRadiusInPixels = 4;
  private _overlaysInteractive = false;
  private _onOverlayTransform?: (event: MorphoViewerOverlayTransformEvent) => void;
  /** Host-selected overlay id (form selection); restored when hover clears. */
  private _highlightedOverlayId: string | null = null;
  /** After a drag, ignore host overlays until origin + tip catch up (API). */
  private _pinnedOverlayOrigin: {
    id: string;
    origin: [number, number, number];
    rotation: { x: number; y: number; z: number };
    /** First contact site — avoids clearing on unrotated placeholder stubs. */
    tip: [number, number, number];
  } | null = null;
  /** Escape hatch if the host never echoes matching geometry. */
  private _pinTimeout: ReturnType<typeof setTimeout> | null = null;
  private _synapses: MorphoViewerWorldOverlay[] = [];
  private _synapsesRadius = 5;
  private _synapsesMinRadiusInPixels = 4;
  private _neuronOpacity = 1;
  private _somaAsSphere = false;
  private spacePerPixel = 1;

  get gizmo() {
    return this.painterGizmo.options;
  }
  set gizmo(gizmo: TgdPainterGizmoOptions | boolean | null | undefined) {
    this.painterGizmo.options = gizmo ?? false;
  }

  /** Applied when cells are built, so a change rebuilds the circuit rather than mutating it. */
  get somaAsSphere(): boolean {
    return this._somaAsSphere;
  }
  set somaAsSphere(somaAsSphere: boolean) {
    if (somaAsSphere === this._somaAsSphere) return;
    this._somaAsSphere = somaAsSphere;
    this.updateCircuit();
  }

  get neuronOpacity(): number {
    return this._neuronOpacity;
  }
  set neuronOpacity(neuronOpacity: number) {
    const opacity = clamp01(neuronOpacity);
    if (this._neuronOpacity === opacity) return;

    this._neuronOpacity = opacity;
    this.groupCells.forEachChild((painter) => {
      if (painter instanceof PainterCell) {
        painter.opacity = opacity;
      }
    });
    this.context.value?.paint();
  }

  readonly cameraReset = (options?: MorphoViewerSignalCameraResetOptions) =>
    this.cameraManager?.resetCamera(options);

  /**
   * capture the current view as an image, without the gizmo. The snapshot is
   * taken inside the render frame (via `context.takeSnapshot`), so it works
   * without `preserveDrawingBuffer`. The frame is rendered at device-pixel
   * resolution so text and edges stay crisp on HiDPI screens; the gizmo is
   * hidden for the capture frame and both are restored right after.
   */
  readonly snapshot = async (
    options?: MorphoViewerSignalSnapshotOptions
  ): Promise<HTMLImageElement | null> => {
    const context = this.context.value;
    if (!context) return null;

    const gizmoWas = this.painterGizmo.options;
    const resolutionWas = context.resolution;
    this.painterGizmo.options = false;
    context.resolution = Math.max(1, Math.min(globalThis.devicePixelRatio || 1, 3));
    const snapshot = context.takeSnapshot({
      type: "image/png",
      quality: 0.8,
      ...options,
    });
    context.paint();
    const image = await snapshot;
    this.painterGizmo.options = gizmoWas;
    context.resolution = resolutionWas;
    context.paint();
    return image;
  };

  get verbose(): boolean {
    return this._verbose;
  }
  set verbose(verbose: boolean) {
    if (this._verbose === verbose) return;

    this._verbose = verbose;
    if (this.context.value) this.context.value.verbose = verbose;
  }

  /**
   * Apply host overlay props into the painter / interaction layer.
   *
   * How / why guards:
   * - While dragging: ignore host geometry (keeps optimistic live buffers)
   * - While pinned after drag: ignore host until origin + tip match (API catch-up),
   *   otherwise unrotated placeholders flash rotation-0 then snap back
   */
  setOverlays(
    overlays: MorphoViewerWorldOverlay[] | undefined,
    overlaysRadius: number,
    overlaysMinRadiusInPixels: number
  ) {
    this._overlaysRadius = overlaysRadius;
    this._overlaysMinRadiusInPixels = overlaysMinRadiusInPixels;
    // While the user is dragging, keep the optimistic overlay geometry —
    // host config updates would otherwise snap points back mid-gesture.
    if (this.overlayInteraction?.isDragging) {
      const painter = this.painterOverlays;
      if (painter) {
        painter.radius = this._overlaysRadius;
        painter.minRadiusInPixels = this._overlaysMinRadiusInPixels;
      }
      return;
    }
    // After drag, keep local overlays until the host summary catches up
    // (debounced API), otherwise markers snap back for hundreds of ms.
    if (this._pinnedOverlayOrigin && overlays?.length) {
      const host = overlays.find((o) => o.id === this._pinnedOverlayOrigin!.id && o.origin);
      const tip = readOverlayTip(overlays, this._pinnedOverlayOrigin.id);
      if (
        host?.origin &&
        tip &&
        originsNearlyEqual(host.origin, this._pinnedOverlayOrigin.origin) &&
        rotationsNearlyEqual(host.rotation, this._pinnedOverlayOrigin.rotation) &&
        originsNearlyEqual(tip, this._pinnedOverlayOrigin.tip)
      ) {
        this.clearPinnedOverlay();
      } else {
        const painter = this.painterOverlays;
        if (painter) {
          painter.radius = this._overlaysRadius;
          painter.minRadiusInPixels = this._overlaysMinRadiusInPixels;
        }
        return;
      }
    }
    // Clone so drag/rotate copy-on-write never mutates the host's React props.
    this._overlays = cloneOverlays(overlays);
    this.applyOverlays();
    // Do NOT expand the circuit camera bbox or re-fit for overlays.
    // Orbit must stay centered on the circuit (hiding electrodes previously
    // "fixed" rotation because it stopped this path from running).
  }

  /**
   * Enable/disable {@link OverlayInteractionController} and refresh its transform callback.
   */
  setOverlayInteraction(
    interactive: boolean,
    onTransform?: (event: MorphoViewerOverlayTransformEvent) => void
  ) {
    this._overlaysInteractive = interactive;
    this._onOverlayTransform = onTransform;
    this.overlayInteraction?.setOnTransform(onTransform);
    if (interactive) {
      this.overlayInteraction?.attach();
    } else {
      this.overlayInteraction?.detach();
    }
  }

  get highlightedOverlayId(): string | null {
    return this._highlightedOverlayId;
  }
  set highlightedOverlayId(id: string | null | undefined) {
    const next = id ?? null;
    if (this._highlightedOverlayId === next) return;
    this._highlightedOverlayId = next;
    // Do not override an active hover/drag highlight from the pointer.
    if (!this.overlayInteraction?.isDragging && this.painterOverlays) {
      this.painterOverlays.highlightedId = next;
    }
  }

  setSynapses(
    synapses: MorphoViewerWorldOverlay[] | undefined,
    synapsesRadius: number,
    synapsesMinRadiusInPixels: number
  ) {
    this._synapses = synapses ?? [];
    this._synapsesRadius = synapsesRadius;
    this._synapsesMinRadiusInPixels = synapsesMinRadiusInPixels;
    this.applySynapses();
  }

  private applyOverlays() {
    const { painterOverlays } = this;
    if (!painterOverlays) return;

    painterOverlays.overlays = this._overlays;
    painterOverlays.radius = this._overlaysRadius;
    painterOverlays.minRadiusInPixels = this._overlaysMinRadiusInPixels;
  }

  private applySynapses() {
    const { painterSynapses } = this;
    if (!painterSynapses) return;

    painterSynapses.synapses = this._synapses;
    painterSynapses.radius = this._synapsesRadius;
    painterSynapses.minRadiusInPixels = this._synapsesMinRadiusInPixels;
  }

  /** Markers for the currently selected morphology locations. */
  setLocationMarkers(
    markers: MorphoViewerMorphologyLocationMarker[],
    color?: string,
    radius?: number
  ) {
    this._locationMarkers = markers;
    this._locationMarkerColor = color ?? DEFAULT_LOCATION_MARKER_COLOR;
    this._locationMarkerRadius = radius ?? DEFAULT_LOCATION_MARKER_RADIUS;
    this.applyLocationMarkers();
  }

  /**
   * Resolve each selected `(cell, section, offset)` to a world point and hand them to the
   * marker painter.
   *
   * Silently skips markers whose cell has not finished loading — its geometry is not known
   * yet, so there is nowhere to put the marker. `setCircuit` re-applies once cells arrive.
   */
  private applyLocationMarkers() {
    const { painterLocationMarkers, segmentOffscreen } = this;
    if (!painterLocationMarkers) return;

    const resolved: typeof this.resolvedLocationMarkers = [];
    if (segmentOffscreen) {
      for (const marker of this._locationMarkers) {
        const cell = this.circuit.find((candidate) => candidate.id === marker.cellId);
        if (!cell) continue;

        const sections = segmentOffscreen.getSections(cell);
        const point = sections?.getPointAtOffset(
          marker.sectionName,
          marker.offset,
          this.dendrogramMix
        );
        if (!sections || !point) continue;

        resolved.push({
          // The host only knows the section id and offset it stored, so the type is filled in
          // here from the geometry it resolved against.
          marker: { ...marker, sectionType: sections.getSectionType(marker.sectionName) },
          point: applyMatrixToPoint(makeCellMatrix(cell), point),
        });
      }
    }
    this.resolvedLocationMarkers = resolved;
    const points = resolved.map((entry) => entry.point);
    painterLocationMarkers.color = this._locationMarkerColor;
    painterLocationMarkers.radius = this._locationMarkerRadius;
    painterLocationMarkers.minRadiusInPixels = LOCATION_MARKER_MIN_RADIUS_IN_PIXELS;
    painterLocationMarkers.markers = points.map(([x, y, z]) => ({ x, y, z }));
    // The set of markers just changed, so labels are stale even if the camera has not moved.
    this.publishLocationLabels();
    this.context.value?.paint();
  }

  /**
   * Report the marker under the pointer, or `null` when there is none.
   *
   * Projects each marker to the screen and takes the nearest within a small radius, rather
   * than rendering a third pick buffer: there are a handful of markers, and a buffer would
   * cost a full pass every frame to answer a question a few dot products already answer.
   *
   * When markers overlap the closest to the pointer wins, which is what the eye expects.
   */
  private readonly updateLocationHover = (xScreen: number, yScreen: number) => {
    const context = this.context.value;
    if (!context) {
      this.setHoveredLocation(null);
      return;
    }

    // An existing marker wins over a preview: the pointer is on something already chosen, and
    // reporting it as "click to add" would invite a duplicate.
    const markerIndex = this.findMarkerAt(xScreen, yScreen);
    if (markerIndex !== null) {
      this.setHoveredLocation(markerIndex);
      this.setPickCursor(true);
      return;
    }

    this.setHoveredLocation(null);
    this.previewLocationAt(xScreen, yScreen);
  };

  /**
   * Resolve whatever neurite is under the pointer, without changing anything.
   *
   * The same work a click does, so a spot can be read before committing to it.
   */
  private previewLocationAt(xScreen: number, yScreen: number) {
    const { offscreen, segmentOffscreen } = this;
    const context = this.context.value;
    if (!offscreen || !segmentOffscreen || !context) {
      this.setPickCursor(false);
      this.eventLocationHover.dispatch(null);
      return;
    }

    const cell =
      offscreen.getItemAt(xScreen, yScreen) ??
      offscreen.getItemNear(xScreen, yScreen, LOCATION_HOVER_SEARCH_IN_PIXELS);
    const segment = cell
      ? segmentOffscreen.getSegmentNear(cell, xScreen, yScreen, LOCATION_HOVER_SEARCH_IN_PIXELS)
      : undefined;
    const sections = cell ? segmentOffscreen.getSections(cell) : null;
    if (!cell || !segment || !sections || segment.sonataSectionId === undefined) {
      this.setPickCursor(false);
      if (this.previewedLocationKey !== null) {
        this.previewedLocationKey = null;
        this.eventLocationHover.dispatch(null);
      }
      return;
    }

    const matrix = makeCellMatrix(cell);
    const offset = computeSectionOffset(
      sections,
      {
        ...segment,
        start: applyMatrixToPoint(
          matrix,
          blendPoint(segment.start, segment.chartStart, this.dendrogramMix)
        ),
        end: applyMatrixToPoint(
          matrix,
          blendPoint(segment.end, segment.chartEnd, this.dendrogramMix)
        ),
      },
      context.camera,
      xScreen,
      yScreen
    );
    this.setPickCursor(true);

    // Keyed so the popover is not re-dispatched on every pixel of pointer travel along one
    // segment, which would make it jitter.
    const key = `${cell.id}/${segment.index}/${offset.toFixed(2)}`;
    if (key === this.previewedLocationKey) return;

    this.previewedLocationKey = key;
    const point = sections.getPointAtOffset(segment.sectionName, offset, this.dendrogramMix);
    this.eventLocationHover.dispatch({
      kind: "preview",
      cellId: cell.id,
      sectionName: segment.sectionName,
      sonataSectionId: segment.sonataSectionId,
      sectionType: segment.sectionType,
      offset,
      screen: point
        ? projectToNormalizedScreen(context, applyMatrixToPoint(matrix, point))
        : { x: (xScreen + 1) / 2, y: (1 - yScreen) / 2 },
    });
  }

  /** Publish label positions on every repaint. Gated: the work is per-frame. */
  /**
   * Morph the cells between their morphology and a dendrogram of the same segments.
   *
   * Animated rather than switched, so a branch stays traceable from one view to the other.
   */
  get dendrogramMode(): boolean {
    return this._dendrogramMode;
  }

  set dendrogramMode(enabled: boolean) {
    if (enabled === this._dendrogramMode) return;
    this._dendrogramMode = enabled;
    this.animateDendrogram(enabled ? 1 : 0);
    // The chart is flat, so rotation is locked; zoom and pan stay live.
    if (enabled) this.cameraReset({ zoom: 1 });
    if (this.cameraManager) this.cameraManager.rotationLocked = enabled;
  }

  private animateDendrogram(target: number) {
    if (this.dendrogramAnimation !== null) {
      cancelAnimationFrame(this.dendrogramAnimation);
      this.dendrogramAnimation = null;
    }

    const from = this.dendrogramMix;
    const span = target - from;
    if (Math.abs(span) < 1e-3) return;

    const DURATION = 600;
    let elapsed = 0;
    let last: number | null = null;

    const step = (now: number) => {
      elapsed += last === null ? 0 : now - last;
      last = now;
      const t = Math.min(1, elapsed / DURATION);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in-out
      this.setDendrogramMix(from + span * eased);
      if (t < 1) {
        this.dendrogramAnimation = requestAnimationFrame(step);
      } else {
        this.dendrogramAnimation = null;
      }
    };

    this.dendrogramAnimation = requestAnimationFrame(step);
  }

  private setDendrogramMix(mix: number) {
    this.dendrogramMix = mix;
    for (const painter of this.cellPainters) painter.dendrogramMix = mix;
    // The pick buffers hold their own geometry, so they morph too or clicks miss.
    if (this.offscreen) this.offscreen.dendrogramMix = mix;
    if (this.segmentOffscreen) this.segmentOffscreen.dendrogramMix = mix;
    // Markers sit on moving geometry.
    this.applyLocationMarkers();
    this.context.value?.paint();
  }

  get locationLabelsEnabled(): boolean {
    return this._locationLabelsEnabled;
  }
  set locationLabelsEnabled(enabled: boolean) {
    if (enabled === this._locationLabelsEnabled) return;

    this._locationLabelsEnabled = enabled;
    if (enabled) this.publishLocationLabels();
    else this.eventLocationLabels.dispatch([]);
  }

  /**
   * Project every resolved marker to the screen and publish the result.
   *
   * Runs in the paint loop, so it stays cheap. Markers behind the camera are reported as not
   * visible rather than dropped, keeping a host's label elements stable.
   */
  private readonly publishLocationLabels = () => {
    if (!this._locationLabelsEnabled) return;

    const context = this.context.value;
    if (!context) return;

    const matrix = new TgdMat4(context.camera.matrixProjection).multiply(
      context.camera.matrixModelView
    );
    this.eventLocationLabels.dispatch(
      this.resolvedLocationMarkers.map(({ marker, point: [x, y, z] }) => {
        const projected = new TgdVec4(x, y, z, 1).applyMatrix(matrix);
        const visible = projected.w > 0;
        if (visible) projected.scale(1 / projected.w);
        return {
          marker,
          visible,
          screen: { x: (projected.x + 1) / 2, y: (1 - projected.y) / 2 },
        };
      })
    );
  };

  /** Index of the selected marker under the pointer, or `null`. */
  private findMarkerAt(xScreen: number, yScreen: number): number | null {
    const context = this.context.value;
    if (!context || this.resolvedLocationMarkers.length === 0) return null;

    // The pointer arrives in clip space, so the pixel tolerance has to be converted too.
    const toleranceX = (2 * LOCATION_HOVER_TOLERANCE_IN_PIXELS) / Math.max(1, context.width);
    const toleranceY = (2 * LOCATION_HOVER_TOLERANCE_IN_PIXELS) / Math.max(1, context.height);
    const matrix = new TgdMat4(context.camera.matrixProjection).multiply(
      context.camera.matrixModelView
    );
    let nearest: { index: number; distance: number } | null = null;
    this.resolvedLocationMarkers.forEach(({ point: [x, y, z] }, index) => {
      const projected = new TgdVec4(x, y, z, 1).applyMatrix(matrix);
      if (projected.w <= 0) return;

      projected.scale(1 / projected.w);
      const dx = (projected.x - xScreen) / toleranceX;
      const dy = (projected.y - yScreen) / toleranceY;
      const distance = dx * dx + dy * dy;
      if (distance > 1) return;
      if (!nearest || distance < nearest.distance) nearest = { index, distance };
    });
    return nearest ? (nearest as { index: number }).index : null;
  }

  private setHoveredLocation(index: number | null) {
    if (index === this.hoveredLocationIndex) return;

    this.hoveredLocationIndex = index;
    const resolved = index === null ? null : this.resolvedLocationMarkers[index];
    const marker = resolved?.marker;
    const point = resolved?.point;
    if (!marker || !point) {
      // Leaving a marker does not necessarily mean leaving the neuron, so the caller decides
      // whether a preview replaces it. Clearing here would make the popover flicker.
      return;
    }
    // Entering a marker supersedes any preview, so forget it or the two will fight.
    this.previewedLocationKey = null;
    const context = this.context.value;
    const screen = context ? projectToNormalizedScreen(context, point) : { x: 0, y: 0 };
    this.eventLocationHover.dispatch({ ...marker, kind: "selected", screen });
  }

  setCircuit(
    circuit: MorphoViewerSmallCircuitCell[],
    loadCell: (id: string) => Promise<MorphoViewerSmallCircuitCellData | null>
  ) {
    if (this.circuit === circuit) {
      return;
    }

    if (circuit.length === 0) {
      this.loadedCellsCache.clear();
      return;
    }

    const signature = circuit.map((item) => item.id).join("\n");
    // A cell id's query part (after `?`) is a reload key: changing it reloads morphologies
    // (hosts use it for filters like the axon toggle) but says nothing about where the cells
    // are. The camera only refits when the cells themselves change, so a reload does not
    // throw away the zoom the user is standing at.
    const placementSignature = circuit.map((item) => item.id.split("?")[0]).join("\n");
    this.fitCameraOnUpdate = this.placementSignature !== placementSignature;
    this.placementSignature = placementSignature;
    if (this.circuitSignature !== signature) {
      this.circuitSignature = signature;
      this.loadedCellsCache.clear();
    }
    this.circuit = circuit;
    this.loadCell = (id: string) => {
      const cached = this.loadedCellsCache.get(id);
      if (cached) return cached;

      const promise = loadCell(id);
      this.loadedCellsCache.set(id, promise);
      return promise;
    };
    this.onLoadProgress?.(0);
    this.context.waitUntiDefined().then(this.updateCircuit);
  }

  private readonly updateCircuit = () => {
    const context = this.context.value;
    if (!context) return;

    const { loadCell } = this;
    if (!loadCell) {
      return;
    }

    console.log(">>> updateCircuit");
    try {
      this.groupCells.removeAll();
      this.onLoadProgress?.(0);
      this.cellCountTotal = this.circuit.length;
      this.cellCountLoaded = 0;
      this.offscreen?.delete();
      this.offscreen = new OffscreenPainter(context, {
        circuit: this.circuit,
        loadCell,
        dendrogramMix: this.dendrogramMix,
      });
      this.rebuildSegmentOffscreen();
      const { cellsForHighlights: highlightingCells } = this;
      highlightingCells.clear();
      this.groupHighlightedCells.removeAll(false);
      this.bbox = new TgdBoundingBox();
      this.cellPainters.splice(0);
      for (const cell of this.circuit) {
        const [x, y, z] = cell.center;
        const r = cell.somaRadius;
        this.bbox.addSphere(x, y, z, r * 5);
        const painterCell = new PainterCell(context, {
          cell,
          loadCell,
          material: "full",
          opacity: this._neuronOpacity,
          somaAsSphere: this._somaAsSphere,
          onCellLoaded: (bbox) => {
            if (bbox) {
              //   recenterBBox(bbox, x, y, z);
              //   this.bbox.addBBox(bbox);
            }
            if (this.fitCameraOnUpdate) {
              this.adaptCameraFromBBox();
            }
            this.cellCountLoaded++;
            this.onLoadProgress?.(this.cellCountLoaded / this.cellCountTotal);
          },
        });
        this.cellPainters.push(painterCell);
        painterCell.dendrogramMix = this.dendrogramMix;
        this.groupCells.add(painterCell);
        const highlightedCell = new PainterCellFlat(context, {
          cell,
          loadCell,
        });
        highlightingCells.set(cell.id, highlightedCell);
      }
      this.updateHightedCells();
      if (this.fitCameraOnUpdate) {
        this.adaptCameraFromBBox();
      }
      context.paint();
    } catch (ex) {
      console.error("Unable ton update circuit:", ex);
    } finally {
      console.log("🐞 [manager@258] this.cellPainters.length =", this.cellPainters.length); // @FIXME: Remove this line written on 2026-07-10 at 11:10
      console.log("<<< updateCircuit");
    }
  };

  private readonly adaptCameraFromBBox = () => {
    try {
      const context = this.context.value;
      if (!context) return;

      const bbox = this.combineCellsBBoxes();
      if (bbox.min[0] > bbox.max[0]) return;

      const { camera } = context;
      if (camera.screenWidth < 1 || camera.screenHeight < 1) {
        /**
         * This part is important because when the viewer is unmounted and mounted again,
         * it won't have the initial paint that is needed to set the screen dimension to
         * the camera.
         */
        const listener = () => {
          context.eventPaint.removeListener(listener);
          this.adaptCameraFromBBox();
        };
        context.eventPaint.addListener(listener);
        context.paint();
        return;
      }

      const bboxW = Math.abs(bbox.max[0] - bbox.min[0]);
      const bboxH = Math.abs(bbox.max[1] - bbox.min[1]);
      const bboxD = Math.abs(bbox.max[2] - bbox.min[2]);
      const bboxRadius = Math.max(bboxW, bboxH, bboxD);
      camera.transfo.position = bbox.center;
      const scale = 1.1; // Add a bit of margin around the circuit.
      camera.fitSpaceAtTarget(bboxW * scale, bboxH * scale);
      camera.transfo.distance = bboxRadius * scale;
      camera.near = 1;
      camera.far = camera.transfo.distance * 2;
      camera.zoom = 2;
      if (!this.cameraManager) {
        this.cameraManager = new CameraManager(context, this.eventRestingPosition);
        // Created lazily, possibly while already in dendrogram mode.
        this.cameraManager.rotationLocked = this._dendrogramMode;
      }
      this.cameraManager.target = camera.getCurrentState();
      context.paint();
    } catch (ex) {
      console.error("Unable to adapt camera to bbox:", ex);
    }
  };

  private combineCellsBBoxes() {
    const bbox = new TgdBoundingBox();
    for (const painter of this.cellPainters) {
      bbox.addBBox(painter.bbox);
    }
    this.bbox.copyFrom(bbox);
    return bbox;
  }

  public get highlightedCellIds() {
    return this._highlightedCellIds;
  }
  public set highlightedCellIds(value: string[] | undefined) {
    if (value === this._highlightedCellIds) return;

    this._highlightedCellIds = value ?? [];
    this.updateHightedCells();
  }

  private updateHightedCells() {
    const { cellsForHighlights, groupHighlightedCells, circuit, highlightedCellIds } = this;
    groupHighlightedCells.removeAll(false);
    for (const cell of circuit) {
      const painter = cellsForHighlights.get(cell.id);
      if (painter) {
        painter.black = !(highlightedCellIds ?? []).includes(cell.id);
        groupHighlightedCells.add(painter);
      }
    }
    this.context.value?.paint();
  }

  get background() {
    return this._background;
  }
  set background(color: string) {
    this._background = color;
    this.backgroundColor.parse(color);
    this.context.waitUntiDefined().then(() => {
      const clear = this.painterClear;
      if (clear) {
        clear.red = this.backgroundColor.R;
        clear.green = this.backgroundColor.G;
        clear.blue = this.backgroundColor.B;
        clear.alpha = this.backgroundColor.A;
      }
    });
  }

  get canvas() {
    return this._canvas;
  }
  set canvas(canvas: HTMLCanvasElement | null) {
    if (this._canvas === canvas) {
      return;
    }

    if (this.context) {
      this.delete();
    }
    this._canvas = canvas;
    if (!canvas) return;

    const context = new TgdContext(canvas, {
      antialias: true,
      alpha: false,
      verbose: this.verbose,
      name: "RenderingContext",
    });
    const painterSynapses = new PainterSynapses(context);
    this.painterSynapses = painterSynapses;
    // A painter of its own rather than sharing the synapse one: hosts drive synapses from
    // their own data, and location markers must not overwrite them (or be overwritten). It
    // also draws round points, which matters once a marker is big enough to see.
    const painterLocationMarkers = new PainterLocationMarkers(context);
    this.painterLocationMarkers = painterLocationMarkers;
    this.applyLocationMarkers();
    this.applySynapses();
    // Labels are pinned to world points, so they have to be re-projected whenever the camera
    // moves — which is exactly what a repaint means.
    context.eventPaint.addListener(this.publishLocationLabels);
    this.context.value = context;
    context.camera = new TgdCameraOrthographic({
      zoom: 1,
    });
    watchSpacePerPixel(context, this.eventScalebar);
    this.eventScalebar.addListener(this.handleSpacePerPixel);
    context.inputs.pointer.eventHover.addListener(this.handlePointerHover);
    context.inputs.pointer.eventTap.addListener(this.handlePointerTap);
    context.inputs.pointer.eventTapMultiple.addListener(this.debug);
    this.cameraManager = new CameraManager(context, this.eventRestingPosition);
    this.overlayInteraction = new OverlayInteractionController({
      context,
      getOverlays: () => this._overlays,
      setOverlays: (overlays) => {
        this._overlays = overlays;
        this.applyOverlays();
      },
      syncOverlayPositions: () => {
        // Overlay surface only — circuit canvas stays frozen during drag.
        this.painterOverlays?.syncPositions();
      },
      getHitRadiusPixels: () =>
        Math.max(
          this._overlaysMinRadiusInPixels * 1.8,
          this._overlaysRadius / Math.max(this.spacePerPixel, 1e-6)
        ),
      getOrbit: () => this.cameraManager,
      setHighlightedId: (id) => {
        if (this.painterOverlays) {
          // Hover clears → fall back to host form selection.
          this.painterOverlays.highlightedId = id ?? this._highlightedOverlayId;
        }
      },
      onTransform: this._onOverlayTransform,
      onDragStart: () => this.overlaySurface.beginDrag(),
      onDragEnd: (id) => {
        this.overlaySurface.endDrag();
        this.pinOverlaysAfterDrag(id);
      },
    });
    if (this._overlaysInteractive) this.overlayInteraction.attach();
    const clear = new TgdPainterClear(context, {
      name: "Clear background and depth",
      color: [
        this.backgroundColor.R,
        this.backgroundColor.G,
        this.backgroundColor.B,
        this.backgroundColor.A,
      ],
      depth: 1,
    });
    this.painterClear = clear;
    this.painterGizmo.context = context;
    // Neurons + synapses on the circuit canvas. Electrodes live on OverlaySurface
    // so drag/rotate does not re-paint morphologies.
    // Alpha blend only while neurons are translucent — opaque path keeps the
    // previous (no-blend) state. Translucent + depth-less is best-effort
    // (no back-to-front sort); see `neuronOpacity` docs.
    let savedNeuronBlend: ReturnType<typeof webglBlendGet> | undefined;
    context.add(
      clear,
      new TgdPainterState(context, {
        depth: "less",
        cull: "back",
        children: [this.groupCells, painterSynapses, painterLocationMarkers],
        onEnter: () => {
          if (this._neuronOpacity >= 1) return;
          savedNeuronBlend = webglBlendGet(context);
          webglBlendSet(context, webglPresetBlend.alpha);
        },
        onExit: () => {
          if (!savedNeuronBlend) return;
          webglBlendSet(context, savedNeuronBlend);
          savedNeuronBlend = undefined;
        },
      }),
      new TgdPainterClear(context, {
        name: "Clear depth",
        depth: 1,
      }),
      new TgdPainterState(context, {
        depth: "lessOrEqual",
        blend: "add",
        cull: "back",
        children: [this.groupHighlightedCells],
      }),
      this.painterGizmo
    );
    this.bindOverlaySurface();
  }

  get overlayCanvas() {
    return this._overlayCanvas;
  }
  set overlayCanvas(canvas: HTMLCanvasElement | null) {
    if (this._overlayCanvas === canvas) return;
    this._overlayCanvas = canvas;
    this.bindOverlaySurface();
  }

  /** Attach electrode painter to the transparent overlay canvas. */
  private bindOverlaySurface() {
    const main = this.context.value ?? null;
    this.overlaySurface.setCanvas(this._overlayCanvas, main);
    this.painterOverlays = this.overlaySurface.overlaysPainter;
    if (this.painterOverlays) this.applyOverlays();
  }

  private readonly handleSpacePerPixel = (spacePerPixel: number) => {
    this.spacePerPixel = spacePerPixel;
  };

  /**
   * Snapshot live origin / rotation / tip after drag for the dragged overlay id.
   * Why: host React Query refetch can briefly supply stale or placeholder
   * geometry; pin keeps the painted probe stable until tip matches.
   *
   * Only pins when the host provided `onOverlayTransform` (otherwise there is
   * nothing to wait for). Escapes after {@link OVERLAY_PIN_TIMEOUT_MS}.
   */
  private pinOverlaysAfterDrag(id: string) {
    this.clearPinnedOverlay();
    if (!this._onOverlayTransform) return;

    const withOrigin = this._overlays.find((o) => o.id === id && o.origin);
    if (!withOrigin?.id || !withOrigin.origin) return;
    const tip = readOverlayTip(this._overlays, withOrigin.id);
    if (!tip) return;
    const rot = withOrigin.rotation;
    this._pinnedOverlayOrigin = {
      id: withOrigin.id,
      origin: [withOrigin.origin[0], withOrigin.origin[1], withOrigin.origin[2]],
      rotation: {
        x: rot?.x ?? 0,
        y: rot?.y ?? 0,
        z: rot?.z ?? 0,
      },
      tip,
    };
    this._pinTimeout = setTimeout(() => this.clearPinnedOverlay(), OVERLAY_PIN_TIMEOUT_MS);
  }

  private clearPinnedOverlay() {
    this._pinnedOverlayOrigin = null;
    if (this._pinTimeout !== null) {
      clearTimeout(this._pinTimeout);
      this._pinTimeout = null;
    }
  }

  public readonly debug = () => {
    const context = this.context.value;
    const camera = context?.camera;
    console.log("🐞 [manager@357] this.bbox =", this.bbox); // @FIXME: Remove this line written on 2026-05-27 at 12:04
    if (camera) {
      console.log(
        [
          `near: ${camera.near}`,
          `far: ${camera.far}`,
          `zoom: ${camera.zoom}`,
          `screenWidth: ${camera.screenWidth}`,
          `screenHeight: ${camera.screenHeight}`,
          `spaceWidthAtTarget: ${camera.spaceWidthAtTarget}`,
          `spaceHeightAtTarget: ${camera.spaceHeightAtTarget}`,
          `distance: ${camera.transfo.distance}`,
          `position: ${camera.transfo.position}`,
        ].join("\n")
      );
    } else {
      console.log("NO CAMERA!!!");
    }
  };

  private readonly handlePointerHover = (evt: TgdInputPointerEventMove) => {
    const { offscreen } = this;
    if (!offscreen) return;

    // Runs before the early return below: a marker sits on a neurite, so the pointer usually
    // has not changed cell and the hover would otherwise never be re-evaluated.
    if (this._locationPickingEnabled) {
      this.updateLocationHover(evt.current.x, evt.current.y);
    }

    const cell = offscreen.getItemAt(evt.current.x, evt.current.y);
    if (cell?.id === this.hoveredCellId) return;

    this.hoveredCellId = cell?.id;
    this.eventCellHover.dispatch(cell);
  };

  /**
   * Show a hand over anything a click would act on.
   *
   * Written to the canvas directly: routing it through React state visibly lags the pointer.
   */
  private setPickCursor(pickable: boolean) {
    const canvas = this._canvas;
    if (!canvas) return;

    const wanted = pickable ? "pointer" : "";
    if (canvas.style.cursor !== wanted) canvas.style.cursor = wanted;
  }

  private readonly handlePointerTap = (evt: TgdInputPointerEventTap) => {
    const { offscreen } = this;
    if (!offscreen) return;

    const cell = offscreen.getItemAt(evt.x, evt.y);
    if (cell) this.eventCellClick.dispatch(cell);

    if (!this._locationPickingEnabled) return;

    // Deliberately re-resolved rather than reusing `cell`: an exact-pixel miss is common on a
    // thin neurite, and it is the difference between a click that works and one that quietly
    // does nothing until the pointer is nudged.
    // A click on an existing marker is a request to remove it, so it is resolved first and
    // reported as-is: re-deriving which stored location was meant from a rounded offset would
    // be guesswork.
    const existingIndex = this.findMarkerAt(evt.x, evt.y);
    if (existingIndex !== null) {
      const { marker } = this.resolvedLocationMarkers[existingIndex];
      const markerCell = this.circuit.find((candidate) => candidate.id === marker.cellId);
      if (markerCell) {
        this.eventLocationPick.dispatch({
          cell: markerCell,
          sectionName: marker.sectionName,
          sonataSectionId: marker.sonataSectionId,
          sectionType: marker.sectionType,
          offset: marker.offset,
          existingMarker: marker,
        });
        return;
      }
    }

    const nearCell = cell ?? offscreen.getItemNear(evt.x, evt.y, LOCATION_PICK_SEARCH_IN_PIXELS);
    if (nearCell) this.dispatchLocationPick(nearCell, evt.x, evt.y);
  };

  /**
   * Whether a click should also be resolved down to a point on a neurite.
   *
   * Setting this builds or tears down the extra pick buffer, so hosts that never ask for
   * locations pay nothing — no second context, no second render per frame.
   */
  get locationPickingEnabled(): boolean {
    return this._locationPickingEnabled;
  }
  set locationPickingEnabled(enabled: boolean) {
    if (enabled === this._locationPickingEnabled) return;

    this._locationPickingEnabled = enabled;
    if (!enabled) {
      // Otherwise the hand cursor and a stale popover outlive the mode that produced them.
      this.setPickCursor(false);
      this.previewedLocationKey = null;
      this.hoveredLocationIndex = null;
      this.eventLocationHover.dispatch(null);
    }
    this.rebuildSegmentOffscreen();
  }

  private rebuildSegmentOffscreen() {
    this.segmentOffscreen?.delete();
    this.segmentOffscreen = null;
    const context = this.context.value;
    const { loadCell } = this;
    // A location pick needs a hit in both buffers, so the cell buffer has to be at least as
    // sharp as the segment one — otherwise thin distal branches resolve to a segment but to
    // no cell, and the click is dropped. Restored to the cheap default once picking is off.
    if (this.offscreen) {
      this.offscreen.resolutionDivider = this._locationPickingEnabled
        ? LOCATION_PICKING_RESOLUTION_DIVIDER
        : CELL_PICKING_RESOLUTION_DIVIDER;
    }
    if (!this._locationPickingEnabled || !context || !loadCell) return;

    this.segmentOffscreen = new SegmentOffscreenPainter(context, {
      circuit: this.circuit,
      loadCell,
      // Cells stream in, and a marker cannot be placed before its cell has geometry. Re-apply
      // as each arrives so a selection restored from the config appears without needing an
      // unrelated redraw to happen to come along.
      onCellLoaded: () => this.applyLocationMarkers(),
      dendrogramMix: this.dendrogramMix,
    });
    // Markers resolve against the section index this painter owns, so any pending selection
    // can only be drawn now that it exists.
    this.applyLocationMarkers();
  }

  /**
   * Turn a click into `(section, offset)` on the clicked cell.
   *
   * Segment coordinates are in the morphology's own space, so they go through the cell's
   * transform before projection. Section lengths do not: placement is rigid.
   */
  private dispatchLocationPick(
    cell: MorphoViewerSmallCircuitCell,
    xScreen: number,
    yScreen: number
  ) {
    const { segmentOffscreen } = this;
    const context = this.context.value;
    if (!segmentOffscreen || !context) return;

    const segment = segmentOffscreen.getSegmentNear(
      cell,
      xScreen,
      yScreen,
      LOCATION_PICK_SEARCH_IN_PIXELS
    );
    const sections = segmentOffscreen.getSections(cell);
    if (!segment || !sections) return;

    const matrix = makeCellMatrix(cell);
    const offset = computeSectionOffset(
      sections,
      {
        ...segment,
        start: applyMatrixToPoint(
          matrix,
          blendPoint(segment.start, segment.chartStart, this.dendrogramMix)
        ),
        end: applyMatrixToPoint(
          matrix,
          blendPoint(segment.end, segment.chartEnd, this.dendrogramMix)
        ),
      },
      context.camera,
      xScreen,
      yScreen
    );
    this.eventLocationPick.dispatch({
      cell,
      sectionName: segment.sectionName,
      sonataSectionId: segment.sonataSectionId,
      sectionType: segment.sectionType,
      offset,
    });
  }

  private delete() {
    this.clearPinnedOverlay();
    this.textureFramebufferCircuit?.delete();
    this.textureFramebufferCircuit = null;
    this.framebufferCircuit?.delete();
    this.framebufferCircuit = null;
    this.framebufferBlur?.delete();
    this.framebufferBlur = null;
    this.framebufferHighlightedCells?.delete();
    this.framebufferHighlightedCells = null;
    this.offscreen?.delete();
    this.offscreen = null;
    this.cameraManager?.delete();
    this.cameraManager = null;
    this.groupCells.removeAll();
    this.painterClear?.delete();
    this.painterClear = null;
    this.overlayInteraction?.detach();
    this.overlayInteraction = null;
    this.overlaySurface.delete();
    this.painterOverlays = null;
    this.painterSynapses = null;
    this.painterGizmo.context = null;
    this.eventScalebar.removeListener(this.handleSpacePerPixel);
    if (this.context.value) {
      this.context.value.inputs.pointer.eventHover.removeListener(this.handlePointerHover);
      this.context.value.delete();
      this.context.value = undefined;
    }
  }
}

export function usePainterManager({
  backgroundColor,
  circuit,
  loadCell,
  onCellHover,
  onCellClick,
  highlightedCellIds,
  onLoadProgress,
  gizmo,
  verbose,
  overlays,
  overlaysRadius = 5,
  overlaysMinRadiusInPixels = 4,
  overlaysInteractive = false,
  onOverlayTransform,
  highlightedOverlayId,
  synapses,
  synapsesRadius = 5,
  synapsesMinRadiusInPixels = 4,
  neuronOpacity = 1,
  somaAsSphere = false,
  signals,
  locationSelection,
  dendrogram = false,
}: MorphoViewerSmallCircuitProps) {
  const [, setSpacePerPixel] = React.useState(-1);
  const ref = React.useRef<PainterManager | null>(null);
  if (!ref.current) {
    ref.current = new PainterManager();
  }
  const manager = ref.current;
  React.useEffect(() => {
    manager.eventScalebar.addListener(setSpacePerPixel);
    manager.onLoadProgress = onLoadProgress;
    manager.verbose = verbose ?? false;
    manager.background = backgroundColor ?? "#000";
    return () => manager.eventScalebar.removeListener(setSpacePerPixel);
  }, [onLoadProgress, manager, verbose, backgroundColor]);

  React.useEffect(() => {
    manager.dendrogramMode = dendrogram;
  }, [manager, dendrogram]);

  React.useEffect(() => {
    if (!signals) return;

    const unregisterReset = signals.cameraReset.register((options) => manager.cameraReset(options));
    const unregisterSnapshot = signals.snapshot.register((options) => manager.snapshot(options));
    return () => {
      unregisterReset();
      unregisterSnapshot();
    };
  }, [signals, manager]);

  React.useEffect(() => {
    manager.setCircuit(circuit, loadCell);
  }, [circuit, loadCell, manager]);

  // Building the extra pick buffer is the expensive part, so it is keyed off presence alone;
  // the selection and the callback change far more often and must not rebuild it.
  const locationPickingEnabled = Boolean(locationSelection);
  React.useEffect(() => {
    manager.locationPickingEnabled = locationPickingEnabled;
  }, [locationPickingEnabled, manager]);

  const onPick = locationSelection?.onPick;
  React.useEffect(() => {
    if (!onPick) return;

    manager.eventLocationPick.addListener(onPick);
    return () => {
      manager.eventLocationPick.removeListener(onPick);
    };
  }, [onPick, manager]);

  const onLocationHover = locationSelection?.onHover;
  React.useEffect(() => {
    if (!onLocationHover) return;

    manager.eventLocationHover.addListener(onLocationHover);
    return () => {
      manager.eventLocationHover.removeListener(onLocationHover);
      // The popover outlives the listener otherwise, pinned to a marker nothing is tracking.
      onLocationHover(null);
    };
  }, [onLocationHover, manager]);

  const selectedLocations = locationSelection?.selected;
  const locationColor = locationSelection?.color;
  const locationRadius = locationSelection?.radius;
  React.useEffect(() => {
    manager.setLocationMarkers(selectedLocations ?? [], locationColor, locationRadius);
  }, [selectedLocations, locationColor, locationRadius, manager]);

  const onLabelsChange = locationSelection?.onLabelsChange;
  React.useEffect(() => {
    if (!onLabelsChange) {
      manager.locationLabelsEnabled = false;
      return;
    }

    // Subscribe *before* enabling. Switching it on publishes the current positions straight
    // away, and with a static camera there is no repaint to follow up with — so a listener
    // added afterwards would wait for a camera move that may never come.
    manager.eventLocationLabels.addListener(onLabelsChange);
    manager.locationLabelsEnabled = true;
    return () => {
      manager.locationLabelsEnabled = false;
      manager.eventLocationLabels.removeListener(onLabelsChange);
    };
  }, [onLabelsChange, manager]);
  React.useEffect(() => {
    manager.highlightedCellIds = highlightedCellIds;
  }, [highlightedCellIds, manager]);
  React.useEffect(() => {
    manager.setOverlays(overlays, overlaysRadius, overlaysMinRadiusInPixels);
  }, [overlays, overlaysRadius, overlaysMinRadiusInPixels, manager]);
  React.useEffect(() => {
    manager.setOverlayInteraction(overlaysInteractive, onOverlayTransform);
  }, [overlaysInteractive, onOverlayTransform, manager]);
  React.useEffect(() => {
    manager.highlightedOverlayId = highlightedOverlayId ?? null;
  }, [highlightedOverlayId, manager]);
  React.useEffect(() => {
    manager.setSynapses(synapses, synapsesRadius, synapsesMinRadiusInPixels);
  }, [synapses, synapsesRadius, synapsesMinRadiusInPixels, manager]);
  React.useEffect(() => {
    manager.neuronOpacity = neuronOpacity;
  }, [neuronOpacity, manager]);

  React.useEffect(() => {
    manager.somaAsSphere = somaAsSphere;
  }, [manager, somaAsSphere]);
  React.useEffect(() => {
    if (!onCellHover) return;

    manager.eventCellHover.addListener(onCellHover);
    return () => {
      manager.eventCellHover.removeListener(onCellHover);
    };
  }, [onCellHover, manager]);
  React.useEffect(() => {
    if (!onCellClick) return;

    manager.eventCellClick.addListener(onCellClick);
    return () => {
      manager.eventCellClick.removeListener(onCellClick);
    };
  }, [onCellClick, manager]);
  React.useEffect(() => {
    manager.gizmo = gizmo ?? false;
  }, [gizmo, manager]);

  return ref.current;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

/** Drop the post-drag pin if the host never echoes matching geometry. */
const OVERLAY_PIN_TIMEOUT_MS = 2000;

/** Shallow-clone overlay groups so interaction never mutates host React props. */
function cloneOverlays(
  overlays: MorphoViewerWorldOverlay[] | undefined
): MorphoViewerWorldOverlay[] {
  if (!overlays?.length) return [];
  return overlays.map((overlay) => ({
    ...overlay,
    origin: overlay.origin ? ([...overlay.origin] as [number, number, number]) : undefined,
    rotation: overlay.rotation ? { ...overlay.rotation } : undefined,
  }));
}

const ORIGIN_EPS = 0.05;
const ROT_EPS = 0.05;

function originsNearlyEqual(
  a: readonly [number, number, number] | number[],
  b: readonly [number, number, number]
): boolean {
  return (
    Math.abs(a[0] - b[0]) <= ORIGIN_EPS &&
    Math.abs(a[1] - b[1]) <= ORIGIN_EPS &&
    Math.abs(a[2] - b[2]) <= ORIGIN_EPS
  );
}

function rotationsNearlyEqual(
  a: { x?: number; y?: number; z?: number } | undefined,
  b: { x: number; y: number; z: number }
): boolean {
  return (
    Math.abs((a?.x ?? 0) - b.x) <= ROT_EPS &&
    Math.abs((a?.y ?? 0) - b.y) <= ROT_EPS &&
    Math.abs((a?.z ?? 0) - b.z) <= ROT_EPS
  );
}

/** First contact site for an electrode id (prefer `kind: electrodes`). */
function readOverlayTip(
  overlays: MorphoViewerWorldOverlay[],
  id: string
): [number, number, number] | null {
  const prefer = overlays.find(
    (o) => o.id === id && (o.kind === "electrodes" || !o.kind) && o.coordinates.length >= 3
  );
  const fallback = overlays.find((o) => o.id === id && o.coordinates.length >= 3);
  const coords = prefer?.coordinates ?? fallback?.coordinates;
  if (!coords || coords.length < 3) return null;
  return [coords[0], coords[1], coords[2]];
}

/** World matrix for a placed cell — the transform `PainterCell` applies to its geometry. */
function makeCellMatrix(cell: MorphoViewerSmallCircuitCell): TgdMat4 {
  const transfo = new TgdTransfo();
  const [x, y, z] = cell.center;
  transfo.setPosition(x, y, z);
  transfo.orientation = new TgdQuat(cell.orientation);
  return new TgdMat4(transfo.matrix);
}

/**
 * A segment endpoint as currently displayed: its 3D position, its dendrogram position, or the
 * in-between while the morph is animating. Offsets are projections onto what the user sees, so
 * they must use these — projecting the 3D endpoints under a dendrogram reads clicks against a
 * shape that is not on screen.
 */
function blendPoint(a: ArrayNumber3, b: ArrayNumber3, mix: number): ArrayNumber3 {
  if (mix <= 0) return a;
  return [a[0] + (b[0] - a[0]) * mix, a[1] + (b[1] - a[1]) * mix, a[2] + (b[2] - a[2]) * mix];
}

function applyMatrixToPoint(matrix: TgdMat4, [x, y, z]: ArrayNumber3): ArrayNumber3 {
  const point = new TgdVec4(x, y, z, 1).applyMatrix(matrix);
  return [point.x, point.y, point.z];
}

/**
 * Where a world point lands on the canvas, as fractions of its width and height.
 *
 * Normalized so a host can position with percentages and stay correct across resizes.
 */
function projectToNormalizedScreen(
  context: TgdContext,
  [x, y, z]: ArrayNumber3
): { x: number; y: number } {
  const matrix = new TgdMat4(context.camera.matrixProjection).multiply(
    context.camera.matrixModelView
  );
  const point = new TgdVec4(x, y, z, 1).applyMatrix(matrix);
  if (point.w !== 0) point.scale(1 / point.w);
  return { x: (point.x + 1) / 2, y: (1 - point.y) / 2 };
}
