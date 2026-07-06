import {
  TgdBoundingBox,
  TgdCameraOrthographic,
  TgdCameraPerspective,
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
import { cssColorToRgba } from "@/utils";

import { AdpatativeResolution } from "./adaptative-resolution";
import { PainterCellInfos } from "./painter-cell-infos";

import type { MorphoViewerCellInfo, MorphoViewerSomasOnlyProps } from "../types";

class PainterManager {
  /**
   * Dispatch the `spacePerPixel`.
   */
  public readonly eventScalebar = new TgdEvent<number>();

  private _canvas: HTMLCanvasElement | null = null;
  private _cellInfos: MorphoViewerCellInfo[] = [];
  private _backgroundColor = "black";
  private painterCellInfos: PainterCellInfos | null = null;
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
    const { painterClear, context } = this;
    if (painterClear && context) {
      const [red, green, blue, alpha] = cssColorToRgba(backgroundColor);
      painterClear.red = red;
      painterClear.green = green;
      painterClear.blue = blue;
      painterClear.alpha = alpha;
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

  /** rebuild only the point cloud inside the existing scene/context. */
  private recolorInPlace() {
    const { context, state, cellInfos } = this;
    if (!context || !state) return;

    state.removeAll(true);
    const painterCellInfos = new PainterCellInfos(context, {
      cellInfos,
      somaRadius: this.somaRadius,
    });
    this.painterCellInfos = painterCellInfos;
    this.bbox = painterCellInfos.bbox;
    state.add(painterCellInfos);
    context.paint();
  }

  readonly cameraReset = () => {
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
    const state = resettedCamera.getCurrentState();
    context.animSchedule({
      duration: 0.5,
      action: tgdActionCreateCameraInterpolation(context.camera, state),
      onEnd: this.adaptativeResolution.highRes,
    });
    this.adaptativeResolution.lowRes();
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
    const clear = new TgdPainterClear(context, {
      color: cssColorToRgba(this._backgroundColor),
      depth: 1,
    });
    this.painterClear = clear;
    const painterCellInfos = new PainterCellInfos(context, {
      cellInfos,
      somaRadius: this.somaRadius,
    });
    this.painterCellInfos = painterCellInfos;
    const state = new TgdPainterState(context, {
      depth: "less",
      children: [painterCellInfos],
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
    context.paint();
    context.execAfterNextPaint(this.cameraReset);
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
    this.orbit?.detach();
    this.orbit = null;
    this.painterClear = null;
    this.state = null;
    this.painterCellInfos = null;
    this.context.delete();
    this.context = null;
  }
}

export type { PainterManager };

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

export function useManager({
  cellInfos,
  somaRadius,
  gizmo,
  cameraType,
  backgroundColor,
  resetCameraSignal,
}: MorphoViewerSomasOnlyProps): PainterManager {
  const refManager = React.useRef<PainterManager | null>(null);
  if (!refManager.current) refManager.current = new PainterManager();
  const manager = refManager.current;
  const prevResetRef = React.useRef(resetCameraSignal);
  React.useEffect(() => {
    manager.cellInfos = cellInfos;
  }, [cellInfos, manager]);
  React.useEffect(() => {
    manager.backgroundColor = backgroundColor ?? "black";
  }, [backgroundColor, manager]);
  React.useEffect(() => {
    // only reset when the signal actually changes, not on mount
    if (prevResetRef.current === resetCameraSignal) return;
    prevResetRef.current = resetCameraSignal;
    manager.cameraReset();
  }, [resetCameraSignal, manager]);
  React.useEffect(() => {
    manager.cameraType = cameraType ?? "orthographic";
  }, [cameraType, manager]);
  React.useEffect(() => {
    manager.somaRadius = somaRadius ?? DEFAULT_SOMA_RADIUS;
  }, [somaRadius, manager]);
  React.useEffect(() => {
    manager.gizmo = gizmo;
  }, [gizmo, manager]);
  return refManager.current;
}

const DEFAULT_SOMA_RADIUS = 12;
