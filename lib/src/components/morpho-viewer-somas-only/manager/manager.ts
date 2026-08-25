import {
  TgdBoundingBox,
  TgdCameraOrthographic,
  TgdCameraPerspective,
  TgdColor,
  TgdContext,
  TgdControllerCameraOrbit,
  TgdEvent,
  TgdPainterClear,
  type TgdPainterGizmoOptions,
  TgdPainterState,
  tgdActionCreateCameraInterpolation,
  webglBlendGet,
  webglBlendSet,
  webglPresetBlend,
} from "@tolokoban/tgd";
import React from "react";

import { watchSpacePerPixel } from "@/behaviors";
import { PainterGizmo } from "@/painters/gizmo";
import { OverlayInteractionController } from "@/painters/overlay-interaction";
import { OverlaySurface } from "@/painters/overlay-surface";
import { PainterWorldOverlays } from "@/painters/world-overlays";
import {
  DEFAULT_SPIKE_AFTERGLOW_IN_SECONDS,
  DEFAULT_SPIKE_SPEED,
  SpikingCircuit,
} from "@/spikes";

import { AdpatativeResolution } from "./adaptative-resolution";
import { PainterCellInfos } from "./painter-cell-infos";

import type {
  MorphoViewerSignalCameraResetOptions,
  MorphoViewerSignalSnapshotOptions,
} from "../../signals";
import type {
  MorphoViewerOverlayTransformEvent,
  MorphoViewerWorldOverlay,
} from "../../types";
import type { MorphoViewerSpikes } from "@/spikes";
import type { MorphoViewerCellInfo, MorphoViewerSomasOnlyProps } from "../types";

class PainterManager {
  /**
   * Dispatch the `spacePerPixel`.
   */
  public readonly eventScalebar = new TgdEvent<number>();

  /** The spike replay playhead, in milliseconds, on every painted frame. */
  public readonly eventSpikeTime = new TgdEvent<number>();
  /** Playback stopping, whether the host asked for it or the recording ran out. */
  public readonly eventSpikePlaying = new TgdEvent<boolean>();

  private _canvas: HTMLCanvasElement | null = null;
  private _overlayCanvas: HTMLCanvasElement | null = null;
  private _cellInfos: MorphoViewerCellInfo[] = [];
  private _backgroundColor = "black";
  private readonly parsedBackgroundColor = new TgdColor(0, 0, 0, 1);
  private painterCellInfos: PainterCellInfos | null = null;
  private readonly spiking = new SpikingCircuit();
  private painterOverlays: PainterWorldOverlays | null = null;
  private readonly overlaySurface = new OverlaySurface();
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
    tip: [number, number, number];
  } | null = null;
  /** Escape hatch if the host never echoes matching geometry. */
  private _pinTimeout: ReturnType<typeof setTimeout> | null = null;
  /** the scene node that holds the point cloud; kept so a recolor can swap the
   * cloud in place without recreating the context (preserving the camera). */
  private state: TgdPainterState | null = null;
  private painterClear: TgdPainterClear | null = null;
  private context: TgdContext | null = null;
  private orbit: TgdControllerCameraOrbit | null = null;
  private bbox = new TgdBoundingBox();
  private scalebarCleanup: (() => void) | null = null;
  private readonly painterGizmo = new PainterGizmo();
  private readonly adaptativeResolution = new AdpatativeResolution();
  private _somaRadius = 1;
  private _neuronOpacity = 1;
  private spacePerPixel = 1;
  private readonly cameraOrtho = new TgdCameraOrthographic({
    name: "CameraOrtho",
  });
  private readonly cameraPersp = new TgdCameraPerspective({
    name: "CameraPersp",
  });
  private _cameraType: "orthographic" | "perspective" = "orthographic";

  get cameraType(): "orthographic" | "perspective" {
    return this._cameraType;
  }
  set cameraType(cameraType: "orthographic" | "perspective") {
    if (this._cameraType === cameraType) return;

    this._cameraType = cameraType;
    const { context } = this;
    if (context) {
      context.camera = cameraType === "orthographic" ? this.cameraOrtho : this.cameraPersp;
      this.applyBBoxToCamera();
      context.paint();
    }
  }

  get gizmo() {
    return this.painterGizmo.options;
  }
  set gizmo(gizmo: TgdPainterGizmoOptions | boolean | null | undefined) {
    this.painterGizmo.options = gizmo ?? false;
  }

  get somaRadius(): number {
    return this._somaRadius;
  }
  set somaRadius(somaRadius: number) {
    if (this._somaRadius === somaRadius) return;

    this._somaRadius = somaRadius;
    const { painterCellInfos } = this;
    if (painterCellInfos) {
      painterCellInfos.somaRadius = somaRadius;
    }
    this.adaptativeResolution.reset();
  }

  get neuronOpacity(): number {
    return this._neuronOpacity;
  }
  set neuronOpacity(neuronOpacity: number) {
    const opacity = clamp01(neuronOpacity);
    if (this._neuronOpacity === opacity) return;

    this._neuronOpacity = opacity;
    if (this.painterCellInfos) {
      this.painterCellInfos.opacity = opacity;
    }
  }

  get canvas(): HTMLCanvasElement | null {
    return this._canvas;
  }
  set canvas(canvas: HTMLCanvasElement | null) {
    if (this._canvas === canvas) return;

    this._canvas = canvas;
    if (canvas) this.initialize();
    else this.delete();
  }

  get overlayCanvas(): HTMLCanvasElement | null {
    return this._overlayCanvas;
  }
  set overlayCanvas(canvas: HTMLCanvasElement | null) {
    if (this._overlayCanvas === canvas) return;
    this._overlayCanvas = canvas;
    this.bindOverlaySurface();
  }

  get backgroundColor(): string {
    return this._backgroundColor;
  }
  set backgroundColor(backgroundColor: string) {
    if (this._backgroundColor === backgroundColor) return;

    this._backgroundColor = backgroundColor;
    this.parsedBackgroundColor.parse(backgroundColor);
    const { painterClear, context } = this;
    if (painterClear && context) {
      painterClear.red = this.parsedBackgroundColor.R;
      painterClear.green = this.parsedBackgroundColor.G;
      painterClear.blue = this.parsedBackgroundColor.B;
      painterClear.alpha = this.parsedBackgroundColor.A;
      context.paint();
    }
  }

  /**
   * Push this frame's glow into the point cloud.
   *
   * One buffer upload for the whole circuit rather than a call per cell: the
   * morphology viewer can afford to walk its cells because it has tens of them,
   * and this one may have millions.
   */
  private applyCellGlow() {
    this.painterCellInfos?.setGlow(this.spiking.glow);
  }

  /**
   * The same, for the paths that also moved the clock.
   *
   * Split from {@link applyCellGlow} so that rebuilding the cloud — a recolour,
   * a resize — does not announce a playhead that has not moved.
   */
  private applySpikeFrame() {
    this.applyCellGlow();
    this.eventSpikeTime.dispatch(this.spiking.timeInMs);
  }

  /**
   * Advance the replay by one frame.
   *
   * Bound to a paint event rather than to a timer of its own, so the clock only
   * moves when a frame is actually drawn — a viewer nobody is looking at costs
   * nothing. `eventPaint` and not `eventPaintEnter` because tgd dispatches the
   * latter twice per frame, which would upload the glow buffer twice.
   */
  private readonly handleSpikeFrame = () => {
    const { spiking } = this;
    if (!spiking.playing) return;

    const reachedEnd = spiking.advance();
    this.applySpikeFrame();
    if (reachedEnd) {
      this.context?.pause();
      this.eventSpikePlaying.dispatch(false);
    }
  };

  /**
   * Swap the recording being replayed.
   *
   * The clock restarts at the beginning of the new one, so playback stops —
   * and the host has to hear about it. Its own `spikePlaying` prop is what the
   * play button reads, and it did not change just because the spikes did, so
   * without this the button says "pause" over a replay that is not running.
   */
  setSpikes(spikes: MorphoViewerSpikes | undefined) {
    const wasPlaying = this.spiking.playing;
    this.spiking.setSpikes(spikes ?? null, this._cellInfos.length);
    this.applySpikeFrame();
    if (wasPlaying) {
      this.context?.pause();
      this.eventSpikePlaying.dispatch(false);
    }
    this.context?.paint();
  }

  get spikeTime(): number {
    return this.spiking.timeInMs;
  }
  set spikeTime(timeInMs: number) {
    if (this.spiking.timeInMs === timeInMs) return;

    this.spiking.timeInMs = timeInMs;
    this.applySpikeFrame();
    this.context?.paint();
  }

  get spikePlaying(): boolean {
    return this.spiking.playing;
  }
  set spikePlaying(playing: boolean) {
    if (this.spiking.playing === playing) return;

    // Pressing play at the end restarts from the beginning, so the glow has to
    // be recomputed even though only the flag was set.
    this.spiking.playing = playing;
    this.applySpikeFrame();
    if (playing) this.context?.play();
    else this.context?.pause();
    this.eventSpikePlaying.dispatch(playing);
  }

  get spikeSpeed(): number {
    return this.spiking.speed;
  }
  set spikeSpeed(speed: number) {
    if (this.spiking.speed === speed) return;

    this.spiking.speed = speed;
    this.applyCellGlow();
    this.context?.paint();
  }

  get spikeAfterglowInSeconds(): number {
    return this.spiking.afterglowInSeconds;
  }
  set spikeAfterglowInSeconds(afterglowInSeconds: number) {
    if (this.spiking.afterglowInSeconds === afterglowInSeconds) return;

    this.spiking.afterglowInSeconds = afterglowInSeconds;
    this.applyCellGlow();
    this.context?.paint();
  }

  get cellInfos(): MorphoViewerCellInfo[] {
    return this._cellInfos;
  }
  set cellInfos(cellInfos: MorphoViewerCellInfo[]) {
    if (this._cellInfos === cellInfos) return;

    const previous = this._cellInfos;
    this._cellInfos = cellInfos;
    this.spiking.setCellCount(cellInfos.length);
    // a recolor keeps the same somas (ids + positions) and only swaps colors:
    // swap the point cloud in place, keep the context/camera/orbit untouched so
    // the user's zoom/angle is preserved (and no flicker). Any geometry change
    // (different count, ids, or positions) → full rebuild + camera refit.
    const colorOnly = !!this.context && !!this.state && sameGeometry(previous, cellInfos);
    if (colorOnly) {
      this.recolorInPlace();
      return;
    }
    if (this.context) {
      this.delete();
    }
    this.initialize();
  }

  /**
   * Apply host overlay props into the painter / interaction layer.
   *
   * How / why guards:
   * - While dragging: ignore host geometry (keeps optimistic live buffers)
   * - While pinned after drag: ignore host until origin + tip match (API catch-up)
   */
  setOverlays(
    overlays: MorphoViewerWorldOverlay[] | undefined,
    overlaysRadius: number,
    overlaysMinRadiusInPixels: number
  ) {
    this._overlaysRadius = overlaysRadius;
    this._overlaysMinRadiusInPixels = overlaysMinRadiusInPixels;
    if (this.overlayInteraction?.isDragging) {
      const painter = this.painterOverlays;
      if (painter) {
        painter.radius = this._overlaysRadius;
        painter.minRadiusInPixels = this._overlaysMinRadiusInPixels;
      }
      return;
    }
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
    // Orbit must stay centered on the somas (same as small-circuit).
    this.context?.paint();
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
    if (!this.overlayInteraction?.isDragging && this.painterOverlays) {
      this.painterOverlays.highlightedId = next;
    }
  }

  private applyOverlays() {
    const { painterOverlays } = this;
    if (!painterOverlays) return;

    painterOverlays.overlays = this._overlays;
    painterOverlays.radius = this._overlaysRadius;
    painterOverlays.minRadiusInPixels = this._overlaysMinRadiusInPixels;
  }

  /** rebuild only the point cloud inside the existing scene/context. */
  private recolorInPlace() {
    const { context, state, cellInfos } = this;
    if (!context || !state) return;

    // rebuilding the cloud (parsing + ambient occlusion + buffer upload) blocks
    // the main thread for as long as it takes; that is not render cost.
    this.adaptativeResolution.invalidate();
    state.removeAll(true);
    const painterCellInfos = new PainterCellInfos(context, {
      cellInfos,
      somaRadius: this.somaRadius,
      opacity: this._neuronOpacity,
    });
    this.painterCellInfos = painterCellInfos;
    this.bbox = painterCellInfos.bbox;
    state.add(painterCellInfos);
    // The replacement cloud's glow buffer is zeroed, so a recolour mid-replay
    // would blank every lit soma until the next frame moved the clock.
    this.applyCellGlow();
    context.paint();
  }

  readonly cameraReset = (options?: MorphoViewerSignalCameraResetOptions) => {
    const { context, bbox } = this;
    if (!context) return;

    context.camera.screenWidth = context.width;
    context.camera.screenHeight = context.height;
    const resettedCamera = context.camera.clone();
    const [width, height] = bbox.size;
    if (
      width < 1 ||
      height < 1 ||
      resettedCamera.screenWidth < 1 ||
      resettedCamera.screenHeight < 1
    ) {
      return;
    }

    resettedCamera.fitBoundingBox(bbox);
    if (Number.isNaN(resettedCamera.transfo.distance)) {
      // Can be NaN if the screen size has not yet been defined.
      return;
    }
    resettedCamera.zoom = options?.zoom ?? 1;
    const state = resettedCamera.getCurrentState();
    context.animSchedule({
      duration: 0.5,
      action: tgdActionCreateCameraInterpolation(context.camera, state),
      onEnd: this.adaptativeResolution.highRes,
    });
    this.adaptativeResolution.lowRes();
  };

  /**
   * capture the current view as an image, without the gizmo. The snapshot is
   * taken inside the render frame (via `context.takeSnapshot`), so it works
   * without `preserveDrawingBuffer`. The frame is rendered at device-pixel
   * resolution so text and edges stay crisp on HiDPI screens (the live view may
   * render downscaled), with the gizmo hidden; both are restored afterwards.
   */
  readonly snapshot = async (
    options?: MorphoViewerSignalSnapshotOptions
  ): Promise<HTMLImageElement | null> => {
    const { context } = this;
    if (!context) return null;

    const gizmoWas = this.painterGizmo.options;
    this.painterGizmo.options = false;
    // the capture owns `context.resolution` until it resolves, so an
    // interaction starting meanwhile must not downscale the captured frame.
    this.adaptativeResolution.suspend();
    try {
      context.resolution = captureResolution();
      const snapshot = context.takeSnapshot({
        type: "image/png",
        quality: 0.8,
        ...options,
      });
      context.paint();
      return await snapshot;
    } finally {
      this.painterGizmo.options = gizmoWas;
      // restore the live view to full (non-HiDPI) resolution; the adaptive
      // downscaler re-adjusts on the next interaction. A failed capture must
      // not strand the canvas at device-pixel resolution with no gizmo.
      this.adaptativeResolution.resume();
      context.paint();
    }
  };

  private applyBBoxToCamera() {
    const { bbox, context } = this;
    if (!context) return;

    context.execBeforeNextPaint(() => {
      const { camera } = context;
      camera.screenWidth = context.width;
      camera.screenHeight = context.height;
      camera.transfo.position = bbox.center;
      camera.fitBoundingBox(bbox);
    });
    context.paint();
  }

  private initialize() {
    if (this.context) {
      // Already initialized.
      return;
    }

    const { canvas, cellInfos } = this;
    if (!canvas || !cellInfos) {
      // We don't have all we need yet.
      return;
    }

    const context = new TgdContext(canvas, {
      alpha: false,
      antialias: true,
      depth: true,
      resolution: 1,
      // Empty on purpose: tgd would size the canvas inside its ResizeObserver
      // callback, wiping the drawing buffer a frame before the repaint. The paint
      // frame sizes it itself. See the small-circuit manager for the full story.
      onResize: () => {},
    });
    this.context = context;
    this.adaptativeResolution.context = context;
    context.eventResize.addListener(this.handleResize);
    this.scalebarCleanup = watchSpacePerPixel(context, this.eventScalebar);
    this.eventScalebar.addListener(this.handleSpacePerPixel);
    this.parsedBackgroundColor.parse(this._backgroundColor);
    const clear = new TgdPainterClear(context, {
      color: this.parsedBackgroundColor.toArayNumber4(),
      depth: 1,
    });
    this.painterClear = clear;
    const painterCellInfos = new PainterCellInfos(context, {
      cellInfos,
      somaRadius: this.somaRadius,
      opacity: this._neuronOpacity,
    });
    this.painterCellInfos = painterCellInfos;
    this.applyCellGlow();
    context.eventPaint.addListener(this.handleSpikeFrame);
    // A context is created paused. One that reopens mid-replay has to be told
    // to run, or the clock would sit still until something else asked to paint.
    if (this.spiking.playing) context.play();
    // Translucent somas on the circuit canvas; electrodes on OverlaySurface.
    // Alpha blend only while somas are translucent — opaque path keeps the
    // previous (no-blend) state. See `neuronOpacity` docs for draw-order limits.
    let savedNeuronBlend: ReturnType<typeof webglBlendGet> | undefined;
    const state = new TgdPainterState(context, {
      depth: "less",
      children: [painterCellInfos],
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
    });
    this.state = state;
    this.painterGizmo.context = context;
    context.add(clear, state, this.painterGizmo);
    const { bbox } = painterCellInfos;
    this.bbox = bbox;
    const camera = this.cameraType === "orthographic" ? this.cameraOrtho : this.cameraPersp;
    context.camera = camera;
    this.applyBBoxToCamera();
    this.orbit = new TgdControllerCameraOrbit(context, {
      inertiaOrbit: 1000,
      inertiaPanning: 1000,
      inertiaZoom: 300,
    });
    this.orbit.eventChange.addListener(this.handleCameraChange);
    this.overlayInteraction = new OverlayInteractionController({
      context,
      getOverlays: () => this._overlays,
      setOverlays: (overlays) => {
        this._overlays = overlays;
        this.applyOverlays();
      },
      syncOverlayPositions: () => {
        this.painterOverlays?.syncPositions();
      },
      getHitRadiusPixels: () =>
        Math.max(this._overlaysMinRadiusInPixels * 1.8, this._overlaysRadius / Math.max(this.spacePerPixel, 1e-6)),
      getOrbit: () => this.orbit,
      setHighlightedId: (id) => {
        if (this.painterOverlays) {
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
    this.bindOverlaySurface();
    context.paint();
    context.execAfterNextPaint(() => this.cameraReset());
  }

  private bindOverlaySurface() {
    this.overlaySurface.setCanvas(this._overlayCanvas, this.context);
    this.painterOverlays = this.overlaySurface.overlaysPainter;
    if (this.painterOverlays) this.applyOverlays();
  }

  private readonly handleSpacePerPixel = (spacePerPixel: number) => {
    this.spacePerPixel = spacePerPixel;
  };

  /**
   * A canvas resize — entering fullscreen, most notably — reallocates the
   * drawing buffer and comes with a layout stall. Those frames say nothing
   * about how fast the machine renders.
   */
  private readonly handleResize = () => {
    this.adaptativeResolution.invalidate();
  };

  /**
   * Snapshot live origin / rotation / tip after drag for the dragged overlay id.
   * Only pins when `onOverlayTransform` is provided; escapes after timeout.
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

  private _cameraChangeTimeout = -1;

  private handleCameraChange = () => {
    const { context } = this;
    if (!context) return;

    globalThis.clearTimeout(this._cameraChangeTimeout);
    this._cameraChangeTimeout = globalThis.setTimeout(
      this.adaptativeResolution.highRes,
      50
    ) as unknown as number;
    this.adaptativeResolution.lowRes();
  };

  private delete() {
    this.clearPinnedOverlay();
    this.adaptativeResolution.context = null;
    if (!this.context) {
      // Nothing to delete.
      return;
    }

    this.scalebarCleanup?.();
    this.context.eventPaint.removeListener(this.handleSpikeFrame);
    this.context.eventResize.removeListener(this.handleResize);
    this.eventScalebar.removeListener(this.handleSpacePerPixel);
    this.overlayInteraction?.detach();
    this.overlayInteraction = null;
    this.overlaySurface.delete();
    this.orbit?.detach();
    this.orbit = null;
    this.painterClear = null;
    this.state = null;
    this.painterCellInfos = null;
    this.painterOverlays = null;
    this.painterGizmo.context = null;
    this.context.delete();
    this.context = null;
  }
}

export type { PainterManager };

/** resolution used for image capture: device pixels for HiDPI crispness, capped
 * so very large canvases don't produce enormous images. */
function captureResolution(): number {
  return Math.max(1, Math.min(globalThis.devicePixelRatio || 1, 3));
}

/** true when both lists describe the same somas (ids + positions), i.e. an
 * update that changed only cosmetic fields (color), not geometry. */
function sameGeometry(a: MorphoViewerCellInfo[], b: MorphoViewerCellInfo[]): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].morphologyId !== b[i].morphologyId) return false;
    const pa = a[i].position;
    const pb = b[i].position;
    if (pa[0] !== pb[0] || pa[1] !== pb[1] || pa[2] !== pb[2]) return false;
  }
  return true;
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

/** First contact XYZ for pin comparison (prefers `kind: electrodes`). */
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

export function useManager({
  cellInfos,
  somaRadius,
  gizmo,
  cameraType,
  backgroundColor,
  overlays,
  overlaysRadius = 5,
  overlaysMinRadiusInPixels = 4,
  overlaysInteractive = false,
  onOverlayTransform,
  highlightedOverlayId,
  neuronOpacity = 1,
  signals,
  spikes,
  spikeTime,
  onSpikeTimeChange,
  spikePlaying = false,
  onSpikePlayingChange,
  spikeSpeed = DEFAULT_SPIKE_SPEED,
  spikeAfterglowInSeconds = DEFAULT_SPIKE_AFTERGLOW_IN_SECONDS,
}: MorphoViewerSomasOnlyProps): PainterManager {
  const refManager = React.useRef<PainterManager | null>(null);
  if (!refManager.current) refManager.current = new PainterManager();
  const manager = refManager.current;
  React.useEffect(() => {
    manager.cellInfos = cellInfos;
  }, [cellInfos, manager]);
  React.useEffect(() => {
    manager.backgroundColor = backgroundColor ?? "black";
  }, [backgroundColor, manager]);
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
    manager.cameraType = cameraType ?? "orthographic";
  }, [cameraType, manager]);
  React.useEffect(() => {
    manager.somaRadius = somaRadius ?? DEFAULT_SOMA_RADIUS;
  }, [somaRadius, manager]);
  React.useEffect(() => {
    manager.neuronOpacity = neuronOpacity;
  }, [neuronOpacity, manager]);
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
    manager.gizmo = gizmo;
  }, [gizmo, manager]);

  React.useEffect(() => {
    manager.setSpikes(spikes);
  }, [spikes, manager]);
  React.useEffect(() => {
    manager.spikeSpeed = spikeSpeed;
  }, [spikeSpeed, manager]);
  React.useEffect(() => {
    manager.spikeAfterglowInSeconds = spikeAfterglowInSeconds;
  }, [spikeAfterglowInSeconds, manager]);
  // A seek, not a mirror of the playhead: the viewer moves the clock itself
  // every frame, and a host that fed the reported time straight back would
  // fight it. Hosts pass this only when the user scrubs — and, since two seeks
  // to the same millisecond are one prop value and React would skip the
  // second, as a one-shot they clear once it has been read.
  React.useEffect(() => {
    if (typeof spikeTime === "number") manager.spikeTime = spikeTime;
  }, [spikeTime, manager]);
  React.useEffect(() => {
    manager.spikePlaying = spikePlaying;
  }, [spikePlaying, manager]);
  React.useEffect(() => {
    if (!onSpikeTimeChange) return;

    manager.eventSpikeTime.addListener(onSpikeTimeChange);
    return () => manager.eventSpikeTime.removeListener(onSpikeTimeChange);
  }, [onSpikeTimeChange, manager]);
  React.useEffect(() => {
    if (!onSpikePlayingChange) return;

    manager.eventSpikePlaying.addListener(onSpikePlayingChange);
    return () => manager.eventSpikePlaying.removeListener(onSpikePlayingChange);
  }, [onSpikePlayingChange, manager]);
  return refManager.current;
}

const DEFAULT_SOMA_RADIUS = 12;
