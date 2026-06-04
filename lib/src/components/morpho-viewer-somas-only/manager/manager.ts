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

import { PainterCellInfos } from "./painter-cell-infos";

import type { MorphoViewerCellInfo, MorphoViewerSomasOnlyProps } from "../types";

class PainterManager {
  /**
   * Dispatch the `spacePerPixel`.
   */
  public readonly eventScalebar = new TgdEvent<number>();

  private _canvas: HTMLCanvasElement | null = null;
  private _cellInfos: MorphoViewerCellInfo[] = [];
  private context: TgdContext | null = null;
  private orbit: TgdControllerCameraOrbit | null = null;
  private bbox = new TgdBoundingBox();
  private scalebarCleanup: (() => void) | null = null;
  private readonly painterGizmo = new PainterGizmo();

  get gizmo() {
    return this.painterGizmo.options;
  }
  set gizmo(gizmo: TgdPainterGizmoOptions | boolean | null | undefined) {
    this.painterGizmo.options = gizmo ?? false;
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
    });
  };

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

    const context = new TgdContext(canvas, { alpha: false, antialias: true, depth: true });
    this.context = context;
    this.scalebarCleanup = watchSpacePerPixel(context, this.eventScalebar);
    const clear = new TgdPainterClear(context, {
      color: [0, 0, 0, 1],
      depth: 1,
    });
    const painterCellInfos = new PainterCellInfos(context, { cellInfos });
    const state = new TgdPainterState(context, {
      depth: "less",
      children: [painterCellInfos],
    });
    this.painterGizmo.context = context;
    context.add(clear, state, this.painterGizmo);
    const camera = new TgdCameraOrthographic();
    const { bbox } = painterCellInfos;
    this.bbox = bbox;
    camera.transfo.position = bbox.center;
    const [width, height, depth] = bbox.size;
    camera.fitSpaceAtTarget(width, height);
    camera.near = 1;
    camera.far = Math.max(camera.transfo.distance, Math.max(width, height, depth)) * 2;
    context.camera = camera;
    this.orbit = new TgdControllerCameraOrbit(context, {
      inertiaOrbit: 1000,
      inertiaPanning: 1000,
      inertiaZoom: 300,
    });
    context.paint();
    context.execAfterNextPaint(this.cameraReset);
  }

  private delete() {
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

export function useManager({ cellInfos, gizmo }: MorphoViewerSomasOnlyProps): PainterManager {
  const refManager = React.useRef<PainterManager | null>(null);
  if (!refManager.current) refManager.current = new PainterManager();
  const manager = refManager.current;
  React.useEffect(() => {
    manager.cellInfos = cellInfos;
  }, [cellInfos, manager]);
  React.useEffect(() => {
    manager.gizmo = gizmo;
  }, [gizmo, manager]);
  return refManager.current;
}
