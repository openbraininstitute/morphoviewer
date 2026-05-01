import {
  TgdBoundingBox,
  TgdCameraPerspective,
  TgdColor,
  TgdContext,
  TgdEvent,
  TgdFilterBlur,
  type TgdInputPointerEventMove,
  type TgdInputPointerEventTap,
  type TgdPainter,
  TgdPainterClear,
  TgdPainterFilter,
  TgdPainterFramebufferWithAntiAliasing,
  TgdPainterGizmo,
  TgdPainterGizmoOptions,
  TgdPainterGroup,
  TgdPainterMix,
  TgdPainterState,
  TgdTexture2D,
  webglPresetBlend,
  webglPresetDepth,
} from "@tolokoban/tgd";
import React from "react";

import { CacheLRU } from "@/tools/cache-lru";

import { CameraManager } from "./camera";
import { OffscreenPainter } from "./offscreen-painter";
import { PainterCell } from "./painter-cell";

import type {
  MorphoViewerSmallCircuitCell,
  MorphoViewerSmallCircuitCellData,
  MorphoViewerSmallCircuitProps,
} from "..";

interface Framebuffer {
  textureColor0?: TgdTexture2D;
  delete(): void;
}

const DEFAULT_GIZMO_PROPS: TgdPainterGizmoOptions = {
  alignX: +1,
  alignY: -1,
  size: 128,
  margin: 8,
};

export class PainterManager {
  public readonly eventRestingPosition = new TgdEvent<boolean>();
  public readonly eventCellHover = new TgdEvent<MorphoViewerSmallCircuitCell | undefined>();
  public readonly eventCellClick = new TgdEvent<MorphoViewerSmallCircuitCell | undefined>();
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
  private context: TgdContext | null = null;
  private cameraManager: CameraManager | null = null;
  private painterClear: TgdPainterClear | null = null;
  private offscreen: OffscreenPainter | null = null;
  private _highlightedCellIds: string[] = [];
  private hoveredCellId: string | undefined = "";
  private readonly groupCells = new TgdPainterGroup({ name: "GroupCell" });
  private circuit: MorphoViewerSmallCircuitCell[] = [];
  private readonly cellsForHighights = new Map<string, PainterCell>();
  private readonly groupHighlithedCells = new TgdPainterGroup({
    name: "groupHighlisthedCells",
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
  private textureFramebufferHighlightedCells: TgdTexture2D | null = null;
  private framebufferBlur: Framebuffer | null = null;
  private textureFramebufferBlur: TgdTexture2D | null = null;
  private loadedCells = new CacheLRU<Promise<MorphoViewerSmallCircuitCellData | null>>(24);
  private circuitSignature = "";
  private bbox = new TgdBoundingBox();
  private _gizmo: false | TgdPainterGizmoOptions = false;
  private painterGizmo: TgdPainterGizmo | null = null;
  private readonly groupGizmo = new TgdPainterGroup({ name: "GroupGizmo" });

  readonly cameraReset = () => this.cameraManager?.resetCamera();

  get gizmo(): false | TgdPainterGizmoOptions {
    return this._gizmo;
  }
  set gizmo(gizmo: boolean | Partial<TgdPainterGizmoOptions> | undefined) {
    if (this._gizmo === gizmo) return;

    if (gizmo === true) {
      this._gizmo = DEFAULT_GIZMO_PROPS;
    } else if (gizmo === false) {
      this._gizmo = false;
    } else {
      this._gizmo = {
        ...DEFAULT_GIZMO_PROPS,
        ...gizmo,
      };
    }
    this.groupGizmo.active = !!this._gizmo;
    if (this.painterGizmo) {
      const { alignX, alignY, size, margin } =
        this._gizmo === false ? DEFAULT_GIZMO_PROPS : this._gizmo;
      this.painterGizmo.alignX = alignX;
      this.painterGizmo.alignY = alignY;
      this.painterGizmo.size = size;
      this.painterGizmo.margin = margin;
    }
  }

  setCircuit(
    circuit: MorphoViewerSmallCircuitCell[],
    loadCell: (id: string) => Promise<MorphoViewerSmallCircuitCellData | null>
  ) {
    if (this.circuit === circuit) return;

    const signature = circuit.map((item) => item.id).join("\n");
    if (this.circuitSignature !== signature) {
      this.circuitSignature = signature;
      this.loadedCells.clear();
    }
    this.circuit = circuit;
    this.loadCell = (id: string) => {
      const cached = this.loadedCells.get(id);
      if (cached) return cached;

      const promise = loadCell(id);
      this.loadedCells.set(id, promise);
      return promise;
    };
    this.updateCircuit();
  }

  private updateCircuit() {
    const { context } = this;
    if (!context) return;

    const { loadCell, loadedCells } = this;
    if (!loadCell) return;

    this.onLoadProgress?.(0);
    this.cellCountTotal = this.circuit.length;
    this.cellCountLoaded = 0;
    const camera = new TgdCameraPerspective({
      zoom: 1,
    });
    this.offscreen = new OffscreenPainter(context, {
      circuit: this.circuit,
      loadCell,
      loadedCells,
    });
    const { cellsForHighights: highlightingCells } = this;
    highlightingCells.clear();
    this.groupHighlithedCells.removeAll(false);
    this.bbox = new TgdBoundingBox();
    for (const cell of this.circuit) {
      const [x, y, z] = cell.center;
      const r = cell.somaRadius;
      this.bbox.addSphere(x, y, z, r * 5);
      const painterCell = new PainterCell(context, {
        cell,
        loadCell,
        matrerial: "full",
        onCellLoaded: (bbox) => {
          if (bbox) {
            this.bbox.addBBox(bbox);
            this.adaptCameraFromBBox();
          }
          this.cellCountLoaded++;
          this.onLoadProgress?.(this.cellCountLoaded / this.cellCountTotal);
        },
      });
      this.groupCells.add(painterCell);
      const highlightedCell = new PainterCell(context, {
        cell,
        loadCell,
        matrerial: "flat",
      });
      highlightingCells.set(cell.id, highlightedCell);
    }
    this.updateHightedCells();
    context.camera = camera;
    this.adaptCameraFromBBox();
    context.paint();
  }

  private adaptCameraFromBBox() {
    const { context } = this;
    if (!context) return;

    const { bbox } = this;
    const { camera } = context;
    const bboxW = Math.abs(bbox.max[0] - bbox.min[0]);
    const bboxH = Math.abs(bbox.max[1] - bbox.min[1]);
    camera.transfo.position = bbox.center;
    const scale = 2;
    camera.fitSpaceAtTarget(bboxW * scale, bboxH * scale);
    camera.near = 1;
    camera.far = camera.transfo.distance * 2;
    camera.zoom = 2;
    const { cameraManager } = this;
    if (cameraManager) {
      cameraManager.target = camera.getCurrentState();
    }
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
    const { cellsForHighights, groupHighlithedCells, circuit, highlightedCellIds } = this;
    groupHighlithedCells.removeAll(false);
    for (const cell of circuit) {
      const painter = cellsForHighights.get(cell.id);
      if (painter) {
        painter.black = true;
        groupHighlithedCells.add(painter);
      }
    }
    for (const id of highlightedCellIds ?? []) {
      const painter = cellsForHighights.get(id);
      if (painter) {
        painter.black = false;
      }
    }
    this.context?.paint();
  }

  get background() {
    return this._background;
  }
  set background(color: string) {
    this._background = color;
    this.backgroundColor.parse(color);
    const clear = this.painterClear;
    if (clear) {
      clear.red = this.backgroundColor.R;
      clear.green = this.backgroundColor.G;
      clear.blue = this.backgroundColor.B;
      clear.alpha = this.backgroundColor.A;
    }
  }

  get canvas() {
    return this._canvas;
  }
  set canvas(canvas: HTMLCanvasElement | null) {
    if (this._canvas === canvas) return;

    if (this.context) {
      this.delete();
    }
    this._canvas = canvas;
    if (!canvas) return;

    const context = new TgdContext(canvas);
    context.inputs.pointer.eventHover.addListener(this.handlePointerHover);
    context.inputs.pointer.eventTap.addListener(this.handlePointerTap);
    this.context = context;
    this.cameraManager = new CameraManager(context, this.eventRestingPosition);
    const clear = new TgdPainterClear(context, {
      color: [
        this.backgroundColor.R,
        this.backgroundColor.G,
        this.backgroundColor.B,
        this.backgroundColor.A,
      ],
      depth: 1,
    });
    this.painterClear = clear;
    // context.add(
    //     this.createramebufferCircuit(context, clear),
    //     this.createFramebufferHighlightedCells(context),
    //     this.createFramebufferBlur(context),
    //     this.createMix(context),
    // )
    this.groupGizmo.removeAll();
    const painterGizmo = new TgdPainterGizmo(context, DEFAULT_GIZMO_PROPS);
    this.painterGizmo = painterGizmo;
    this.groupGizmo.add(painterGizmo);
    context.add(
      clear,
      new TgdPainterState(context, {
        depth: "less",
        cull: "back",
        children: [this.groupCells],
      }),
      // Highlighted cells
      new TgdPainterClear(context, { depth: 1 }),
      new TgdPainterState(context, {
        depth: "less",
        blend: "add",
        cull: "back",
        children: [this.groupHighlithedCells],
      }),
      this.groupGizmo
    );
    this.updateCircuit();
  }

  private createramebufferCircuit(context: TgdContext, clear: TgdPainterClear) {
    this.textureFramebufferCircuit = new TgdTexture2D(context);
    this.framebufferCircuit = new TgdPainterFramebufferWithAntiAliasing(context, {
      textureColor0: this.textureFramebufferCircuit,
      depthBuffer: true,
      children: [
        clear,
        new TgdPainterState(context, {
          depth: webglPresetDepth.less,
          children: [this.groupCells],
        }),
      ],
    });
    return this.framebufferCircuit as TgdPainter;
  }

  private createFramebufferHighlightedCells(context: TgdContext) {
    const { viewportMatchingScale } = this;
    this.textureFramebufferHighlightedCells = new TgdTexture2D(context);
    this.framebufferHighlightedCells = new TgdPainterFramebufferWithAntiAliasing(context, {
      viewportMatchingScale,
      textureColor0: this.textureFramebufferHighlightedCells,
      depthBuffer: true,
      children: [
        new TgdPainterClear(context, { depth: 1, color: [0, 0, 0, 1] }),
        new TgdPainterState(context, {
          depth: webglPresetDepth.less,
          children: [this.groupHighlithedCells],
        }),
      ],
    });
    return this.framebufferHighlightedCells as TgdPainter;
  }

  private createFramebufferBlur(context: TgdContext) {
    const { textureFramebufferHighlightedCells } = this;
    if (!textureFramebufferHighlightedCells)
      throw new Error(
        "You must call createFramebufferHighlightedCells() before this createFramebufferBlur()!"
      );

    const { viewportMatchingScale } = this;
    const size = 3;
    this.textureFramebufferBlur = new TgdTexture2D(context);
    this.framebufferBlur = new TgdPainterFramebufferWithAntiAliasing(context, {
      viewportMatchingScale,
      textureColor0: this.textureFramebufferBlur,
      children: [
        new TgdPainterClear(context, { color: [0, 0, 0, 1] }),
        new TgdPainterState(context, {
          depth: webglPresetDepth.off,
          children: [
            new TgdPainterFilter(context, {
              flipY: true,
              texture: textureFramebufferHighlightedCells,
              filters: [
                new TgdFilterBlur({
                  size,
                  direction: 0,
                }),
                new TgdFilterBlur({
                  size,
                  direction: 90,
                }),
              ],
            }),
          ],
        }),
      ],
    });
    return this.framebufferBlur as TgdPainter;
  }

  private createMix(context: TgdContext) {
    const { framebufferCircuit, framebufferBlur } = this;
    if (!framebufferCircuit)
      throw new Error("Framebuffer for circuit must be created before calling createMix()!");
    if (!framebufferBlur)
      throw new Error("Framebuffer for blur must be created before calling createMix()!");

    return new TgdPainterState(context, {
      depth: webglPresetDepth.off,
      blend: webglPresetBlend.off,
      children: [
        new TgdPainterMix(context, {
          texture1: framebufferCircuit.textureColor0,
          texture2: framebufferBlur.textureColor0,
          strength: 1.5,
        }),
      ],
    });
  }

  private readonly handlePointerHover = (evt: TgdInputPointerEventMove) => {
    const { offscreen } = this;
    if (!offscreen) return;

    const cell = offscreen.getItemAt(evt.current.x, evt.current.y);
    if (cell?.id === this.hoveredCellId) return;

    this.hoveredCellId = cell?.id;
    this.eventCellHover.dispatch(cell);
  };

  private readonly handlePointerTap = (evt: TgdInputPointerEventTap) => {
    const { offscreen } = this;
    if (!offscreen) return;

    const cell = offscreen.getItemAt(evt.x, evt.y);
    if (cell) this.eventCellClick.dispatch(cell);
  };

  private delete() {
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
    if (this.context) {
      this.context.inputs.pointer.eventHover.removeListener(this.handlePointerHover);
      this.context.delete();
      this.context = null;
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
}: MorphoViewerSmallCircuitProps) {
  const ref = React.useRef<PainterManager | null>(null);
  if (!ref.current) {
    ref.current = new PainterManager();
  }
  const manager = ref.current;
  React.useEffect(() => {
    manager.onLoadProgress = onLoadProgress;
  }, [onLoadProgress, manager]);
  React.useEffect(() => {
    manager.background = backgroundColor ?? "#000";
  }, [backgroundColor, manager]);
  React.useEffect(() => {
    manager.setCircuit(circuit, loadCell);
  }, [circuit, loadCell, manager]);
  React.useEffect(() => {
    manager.highlightedCellIds = highlightedCellIds;
  }, [highlightedCellIds, manager]);
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
