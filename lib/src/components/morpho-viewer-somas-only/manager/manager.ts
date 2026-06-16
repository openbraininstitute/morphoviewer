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
  private painterCellInfos: PainterCellInfos | null = null;
  private context: TgdContext | null = null;
  private orbit: TgdControllerCameraOrbit | null = null;
  private bbox = new TgdBoundingBox();
  private scalebarCleanup: (() => void) | null = null;
  private readonly painterGizmo = new PainterGizmo();
  private readonly adaptativeResolution = new AdpatativeResolution();
  private _somaRadius = 1;
  private readonly cameraOrtho = new TgdCameraOrthographic({ name: "CameraOrtho" });
  private readonly cameraPersp = new TgdCameraPerspective({ name: "CameraPersp" });
  private _cameraType: "orthographic" | "perspective" = "orthographic";

  get cameraType(): "orthographic" | "perspective" {
    return this._cameraType;
  }
  set cameraType(cameraType: "orthographic" | "perspective") {
    if (this._cameraType === cameraType) return;

    this._cameraType = cameraType;
    const { context } = this;
    if (context) {
      console.log("🐞 [manager@52] cameraType =", cameraType); // @FIXME: Remove this line written on 2026-06-16 at 12:23
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

  get cellInfos(): MorphoViewerCellInfo[] {
    return this._cellInfos;
  }
  set cellInfos(cellInfos: MorphoViewerCellInfo[]) {
    if (this._cellInfos === cellInfos) return;

    this._cellInfos = cellInfos;
    if (this.context) {
      // cellInfos has changed, we will recreate the points cloud.
      this.delete();
    }
    this.initialize();
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
      color: [0, 0, 0, 1],
      depth: 1,
    });
    const painterCellInfos = new PainterCellInfos(context, {
      cellInfos,
      somaRadius: this.somaRadius,
    });
    this.painterCellInfos = painterCellInfos;
    const state = new TgdPainterState(context, {
      depth: "less",
      children: [painterCellInfos],
    });
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
    this.context.delete();
    this.context = null;
  }
}

export type { PainterManager };

export function useManager({
  cellInfos,
  somaRadius,
  gizmo,
  cameraType,
}: MorphoViewerSomasOnlyProps): PainterManager {
  const refManager = React.useRef<PainterManager | null>(null);
  if (!refManager.current) refManager.current = new PainterManager();
  const manager = refManager.current;
  React.useEffect(() => {
    manager.cellInfos = cellInfos;
  }, [cellInfos, manager]);
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
