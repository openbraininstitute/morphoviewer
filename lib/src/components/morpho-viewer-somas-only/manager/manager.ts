import {
  TgdBoundingBox,
  TgdCameraPerspective,
  TgdContext,
  TgdControllerCameraOrbit,
  TgdPainterClear,
  TgdPainterGizmo,
  TgdPainterState,
  tgdActionCreateCameraInterpolation,
} from "@tolokoban/tgd";
import React from "react";

import { PainterCellInfos } from "./painter-cell-infos";

import type { MorphoViewerCellInfo, MorphoViewerSomasOnlyProps } from "../types";

class PainterManager {
  private _canvas: HTMLCanvasElement | null = null;
  private _cellInfos: MorphoViewerCellInfo[] = [];
  private context: TgdContext | null = null;
  private orbit: TgdControllerCameraOrbit | null = null;
  private bbox = new TgdBoundingBox();

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

    const camera = context.camera.clone();
    const [width, height] = bbox.size;
    console.log("🐞 [manager@55] width, height =", width, height); // @FIXME: Remove this line written on 2026-05-29 at 18:04
    camera.fitSpaceAtTarget(width, height);
    camera.far = camera.transfo.distance * 2;
    const state = camera.getCurrentState();
    console.log(
      "🐞 [manager@58] context.camera.getCurrentState() =",
      context.camera.getCurrentState()
    ); // @FIXME: Remove this line written on 2026-05-29 at 18:01
    console.log("🐞 [manager@59] state =", state); // @FIXME: Remove this line written on 2026-05-29 at 18:02
    context.animSchedule({
      duration: 0.5,
      action: tgdActionCreateCameraInterpolation(camera, state),
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
    const clear = new TgdPainterClear(context, {
      color: [0, 0, 0, 1],
      depth: 1,
    });
    const painterCellInfos = new PainterCellInfos(context, { cellInfos });
    const state = new TgdPainterState(context, {
      depth: "less",
      children: [painterCellInfos],
    });
    // const gizmo = new TgdPainterGizmo(context);
    // context.add(clear, state, gizmo);
    context.add(clear, state);
    const camera = new TgdCameraPerspective();
    const { bbox } = painterCellInfos;
    this.bbox = bbox;
    camera.transfo.position = bbox.center;
    const [width, height] = bbox.size;
    camera.fitSpaceAtTarget(width, height);
    camera.near = 1;
    camera.far = camera.transfo.distance * 2;
    context.camera = camera;
    this.orbit = new TgdControllerCameraOrbit(context, {
      inertiaOrbit: 1000,
      inertiaPanning: 1000,
      inertiaZoom: 300,
    });
    bbox.debug();
    context.paint();
    globalThis.setTimeout(this.cameraReset);
  }

  private delete() {
    if (!this.context) {
      // Nothing to delete.
      return;
    }

    this.orbit?.detach();
    this.orbit = null;
    this.context.delete();
    this.context = null;
  }
}

export type { PainterManager };

export function useManager({ cellInfos }: MorphoViewerSomasOnlyProps): PainterManager {
  const refManager = React.useRef<PainterManager | null>(null);
  if (!refManager.current) refManager.current = new PainterManager();
  const manager = refManager.current;
  React.useEffect(() => {
    manager.cellInfos = cellInfos;
  }, [cellInfos, manager]);
  return refManager.current;
}
