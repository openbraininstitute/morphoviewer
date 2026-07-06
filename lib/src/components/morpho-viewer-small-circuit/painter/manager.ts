import {
  TgdBoundingBox,
  TgdCameraOrthographic,
  TgdColor,
  TgdContext,
  TgdEvent,
  type TgdInputPointerEventMove,
  type TgdInputPointerEventTap,
  TgdPainterClear,
  TgdPainterGizmo,
  type TgdPainterGizmoOptions,
  TgdPainterGroup,
  TgdPainterState,
  type TgdTexture2D,
  TgdValueWaitable,
} from "@tolokoban/tgd";
import React from "react";

import { watchSpacePerPixel } from "@/behaviors";
import { PainterGizmo } from "@/painters/gizmo";
import { CacheLRU } from "@/tools/cache-lru";

import { CameraManager } from "./camera";
import { OffscreenPainter } from "./offscreen-painter";
import { PainterCell } from "./painter-cell";
import { PainterSynapses } from "./painter-synapses";

import type {
  MorphoViewerSmallCircuitCell,
  MorphoViewerSmallCircuitCellData,
  MorphoViewerSmallCircuitProps,
} from "..";

interface Framebuffer {
  textureColor0?: TgdTexture2D;
  delete(): void;
}

export class PainterManager {
  public readonly eventRestingPosition = new TgdEvent<boolean>();
  public readonly eventCellHover = new TgdEvent<MorphoViewerSmallCircuitCell | undefined>();
  public readonly eventCellClick = new TgdEvent<MorphoViewerSmallCircuitCell | undefined>();
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
  private framebufferBlur: Framebuffer | null = null;
  private loadedCellsCache = new CacheLRU<Promise<MorphoViewerSmallCircuitCellData | null>>(24);
  private circuitSignature = "";
  private bbox = new TgdBoundingBox();
  private _verbose = false;
  private readonly painterGizmo = new PainterGizmo();
  private painterSynapses: PainterSynapses | null = null;

  get gizmo() {
    return this.painterGizmo.options;
  }
  set gizmo(gizmo: TgdPainterGizmoOptions | boolean | null | undefined) {
    this.painterGizmo.options = gizmo ?? false;
  }

  readonly cameraReset = () => this.cameraManager?.resetCamera();

  get verbose(): boolean {
    return this._verbose;
  }
  set verbose(verbose: boolean) {
    if (this._verbose === verbose) return;

    this._verbose = verbose;
    if (this.context.value) this.context.value.verbose = verbose;
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

    const { loadCell, loadedCellsCache: loadedCells } = this;
    if (!loadCell) {
      return;
    }

    try {
      this.groupCells.removeAll();
      this.onLoadProgress?.(0);
      this.cellCountTotal = this.circuit.length;
      this.cellCountLoaded = 0;
      this.offscreen?.delete();
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
            }
            this.adaptCameraFromBBox();
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
      this.adaptCameraFromBBox();
      context.paint();
    } catch (ex) {
      console.error("Unable ton update circuit:", ex);
    }
  };

  private readonly adaptCameraFromBBox = () => {
    try {
      const context = this.context.value;
      if (!context) return;

      const { bbox } = this;
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
      }
      this.cameraManager.target = camera.getCurrentState();
      context.paint();
    } catch (ex) {
      console.error("Unable to adapt camera to bbox:", ex);
    }
  };

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
        painter.black = !(highlightedCellIds ?? []).includes(cell.id);
        groupHighlithedCells.add(painter);
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
    this.context.value = context;
    context.camera = new TgdCameraOrthographic({
      zoom: 1,
    });
    watchSpacePerPixel(context, this.eventScalebar);
    context.inputs.pointer.eventHover.addListener(this.handlePointerHover);
    context.inputs.pointer.eventTap.addListener(this.handlePointerTap);
    context.inputs.pointer.eventTapMultiple.addListener(this.debug);
    this.cameraManager = new CameraManager(context, this.eventRestingPosition);
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
    context.add(
      clear,
      new TgdPainterState(context, {
        depth: "less",
        cull: "back",
        children: [this.groupCells, painterSynapses],
      }),
      // Highlighted cells
      new TgdPainterClear(context, { name: "Clear depth", depth: 1 }),
      new TgdPainterState(context, {
        depth: "lessOrEqual",
        blend: "add",
        cull: "back",
        children: [this.groupHighlithedCells],
      }),
      this.painterGizmo
    );
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
