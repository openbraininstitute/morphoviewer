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
} from "@tolokoban/tgd";
import React from "react";

import { watchSpacePerPixel } from "@/behaviors";
import { PainterGizmo } from "@/painters/gizmo";
import {
  boundsFromBBox,
  flattenOverlayMarkers,
  PainterGroundGrid,
  resolveGroundGridStep,
} from "@/painters/ground-grid";
import { PainterWorldOverlays } from "@/painters/world-overlays";

import { AdpatativeResolution } from "./adaptative-resolution";
import { PainterCellInfos } from "./painter-cell-infos";

import type {
  MorphoViewerSignalCameraResetOptions,
  MorphoViewerSignalSnapshotOptions,
} from "../../signals";
import type { MorphoViewerWorldOverlay } from "../../types";
import type { MorphoViewerCellInfo, MorphoViewerSomasOnlyProps } from "../types";

class PainterManager {
  /**
   * Dispatch the `spacePerPixel`.
   */
  public readonly eventScalebar = new TgdEvent<number>();

  private _canvas: HTMLCanvasElement | null = null;
  private _cellInfos: MorphoViewerCellInfo[] = [];
  private _backgroundColor = "black";
  private readonly parsedBackgroundColor = new TgdColor(0, 0, 0, 1);
  private painterCellInfos: PainterCellInfos | null = null;
  private painterOverlays: PainterWorldOverlays | null = null;
  private _overlays: MorphoViewerWorldOverlay[] = [];
  private _overlaysRadius = 5;
  private _overlaysMinRadiusInPixels = 4;
  /** the scene node that holds the point cloud; kept so a recolor can swap the
   * cloud in place without recreating the context (preserving the camera). */
  private state: TgdPainterState | null = null;
  private painterClear: TgdPainterClear | null = null;
  private context: TgdContext | null = null;
  private orbit: TgdControllerCameraOrbit | null = null;
  private bbox = new TgdBoundingBox();
  private scalebarCleanup: (() => void) | null = null;
  private readonly painterGizmo = new PainterGizmo();
  private readonly painterGroundGrid = new PainterGroundGrid();
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

  get groundGrid(): boolean {
    return this.painterGroundGrid.enabled;
  }
  set groundGrid(groundGrid: boolean) {
    this.painterGroundGrid.enabled = groundGrid;
    if (groundGrid) this.updateGroundGrid();
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

  get cellInfos(): MorphoViewerCellInfo[] {
    return this._cellInfos;
  }
  set cellInfos(cellInfos: MorphoViewerCellInfo[]) {
    if (this._cellInfos === cellInfos) return;

    const previous = this._cellInfos;
    this._cellInfos = cellInfos;
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

  setOverlays(
    overlays: MorphoViewerWorldOverlay[] | undefined,
    overlaysRadius: number,
    overlaysMinRadiusInPixels: number
  ) {
    this._overlays = overlays ?? [];
    this._overlaysRadius = overlaysRadius;
    this._overlaysMinRadiusInPixels = overlaysMinRadiusInPixels;
    this.applyOverlays();
    // Do NOT expand the circuit camera bbox or re-fit for overlays.
    // Orbit must stay centered on the somas (same as small-circuit).
    this.context?.paint();
    this.updateGroundGrid();
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

    state.removeAll(true);
    const painterCellInfos = new PainterCellInfos(context, {
      cellInfos,
      somaRadius: this.somaRadius,
      opacity: this._neuronOpacity,
    });
    this.painterCellInfos = painterCellInfos;
    this.bbox = painterCellInfos.bbox;
    state.add(painterCellInfos);
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
    context.resolution = captureResolution();
    const snapshot = context.takeSnapshot({
      type: "image/png",
      quality: 0.8,
      ...options,
    });
    context.paint();
    const image = await snapshot;
    this.painterGizmo.options = gizmoWas;
    // restore the live view to full (non-HiDPI) resolution; the adaptive
    // downscaler re-adjusts on the next interaction.
    this.adaptativeResolution.highRes();
    context.paint();
    return image;
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
    });
    this.context = context;
    this.adaptativeResolution.context = context;
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
    const painterOverlays = new PainterWorldOverlays(context);
    this.painterOverlays = painterOverlays;
    this.applyOverlays();
    // Translucent somas first; overlays with depth off so they stay visible.
    const state = new TgdPainterState(context, {
      depth: "less",
      blend: "alpha",
      children: [painterCellInfos],
    });
    this.state = state;
    this.painterGizmo.context = context;
    this.painterGroundGrid.context = context;
    context.add(
      clear,
      this.painterGroundGrid,
      state,
      new TgdPainterState(context, {
        depth: "off",
        children: [painterOverlays],
      }),
      this.painterGizmo
    );
    const { bbox } = painterCellInfos;
    this.bbox = bbox;
    this.updateGroundGrid();
    const camera = this.cameraType === "orthographic" ? this.cameraOrtho : this.cameraPersp;
    context.camera = camera;
    this.applyBBoxToCamera();
    this.orbit = new TgdControllerCameraOrbit(context, {
      inertiaOrbit: 1000,
      inertiaPanning: 1000,
      inertiaZoom: 300,
    });
    this.orbit.eventChange.addListener(this.handleCameraChange);
    context.paint();
    context.execAfterNextPaint(() => this.cameraReset());
  }

  private readonly handleSpacePerPixel = (spacePerPixel: number) => {
    this.spacePerPixel = spacePerPixel;
    // Only refresh grid *spacing* on zoom — never rebuild markers/bounds here.
    // Full rebuilds during orbit paint loops destroy rotation smoothness.
    if (!this.painterGroundGrid.enabled) return;
    this.painterGroundGrid.setStep(resolveGroundGridStep(spacePerPixel));
  };

  private updateGroundGrid() {
    if (!this.painterGroundGrid.enabled) return;
    // Markers expand the floor patch to cover electrodes, but we do not draw
    // drop lines — those world-locked stalks made orbit feel like tumbling space.
    const markers = flattenOverlayMarkers(this._overlays);
    const { min, max } = this.bbox;
    this.painterGroundGrid.setLayout(
      boundsFromBBox(min, max, 0.2, markers),
      resolveGroundGridStep(this.spacePerPixel),
      // empty markers → no drop lines
      []
    );
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
    this.adaptativeResolution.context = null;
    if (!this.context) {
      // Nothing to delete.
      return;
    }

    this.scalebarCleanup?.();
    this.eventScalebar.removeListener(this.handleSpacePerPixel);
    this.orbit?.detach();
    this.orbit = null;
    this.painterClear = null;
    this.state = null;
    this.painterCellInfos = null;
    this.painterOverlays = null;
    this.painterGroundGrid.context = null;
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

export function useManager({
  cellInfos,
  somaRadius,
  gizmo,
  groundGrid = false,
  cameraType,
  backgroundColor,
  overlays,
  overlaysRadius = 5,
  overlaysMinRadiusInPixels = 4,
  neuronOpacity = 1,
  signals,
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
    manager.gizmo = gizmo;
  }, [gizmo, manager]);
  React.useEffect(() => {
    manager.groundGrid = groundGrid;
  }, [groundGrid, manager]);
  return refManager.current;
}

const DEFAULT_SOMA_RADIUS = 12;
