import {
  TgdBoundingBox,
  TgdCameraOrthographic,
  TgdColor,
  TgdContext,
  TgdEvent,
  type TgdInputPointerEventMove,
  type TgdInputPointerEventTap,
  TgdPainterClear,
  type TgdPainterGizmoOptions,
  TgdPainterGroup,
  TgdPainterState,
  type TgdTexture2D,
  TgdValueWaitable,
} from "@tolokoban/tgd";
import React from "react";

import { watchSpacePerPixel } from "@/behaviors";
import { PainterGizmo } from "@/painters/gizmo";
import { OverlayInteractionController } from "@/painters/overlay-interaction";
import { OverlaySurface } from "@/painters/overlay-surface";
import { PainterWorldOverlays } from "@/painters/world-overlays";
import { CacheLRU } from "@/tools/cache-lru";

import { CameraManager } from "./camera";
import { OffscreenPainter } from "./offscreen-painter";
import { PainterCell, PainterCellFlat } from "./painter-cell";
import { PainterSynapses } from "./painter-synapses";

import type {
  MorphoViewerSignalCameraResetOptions,
  MorphoViewerSignalSnapshotOptions,
} from "../../signals";
import type {
  MorphoViewerOverlayTransformEvent,
  MorphoViewerWorldOverlay,
} from "../../types";
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
  /** when false, the next circuit update rebuilds cells but keeps the camera
   * (used for recolor, where only cell colors change) */
  private fitCameraOnUpdate = true;
  private bbox = new TgdBoundingBox();
  private _verbose = false;
  private readonly painterGizmo = new PainterGizmo();
  private painterOverlays: PainterWorldOverlays | null = null;
  private painterSynapses: PainterSynapses | null = null;
  private readonly cellPainters: PainterCell[] = [];
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
  private _synapses: MorphoViewerWorldOverlay[] = [];
  private _synapsesRadius = 5;
  private _synapsesMinRadiusInPixels = 4;
  private _neuronOpacity = 1;
  private spacePerPixel = 1;

  get gizmo() {
    return this.painterGizmo.options;
  }
  set gizmo(gizmo: TgdPainterGizmoOptions | boolean | null | undefined) {
    this.painterGizmo.options = gizmo ?? false;
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
        this._pinnedOverlayOrigin = null;
      } else {
        const painter = this.painterOverlays;
        if (painter) {
          painter.radius = this._overlaysRadius;
          painter.minRadiusInPixels = this._overlaysMinRadiusInPixels;
        }
        return;
      }
    }
    this._overlays = overlays ?? [];
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
    // same cell ids → geometry is unchanged and only colors differ: rebuild the
    // cells to apply the new colors but keep the current camera (no zoom reset)
    this.fitCameraOnUpdate = this.circuitSignature !== signature;
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
        loadedCells,
      });
      const { cellsForHighights: highlightingCells } = this;
      highlightingCells.clear();
      this.groupHighlithedCells.removeAll(false);
      this.bbox = new TgdBoundingBox();
      this.cellPainters.splice(0);
      for (const cell of this.circuit) {
        const [x, y, z] = cell.center;
        const r = cell.somaRadius;
        this.bbox.addSphere(x, y, z, r * 5);
        const painterCell = new PainterCell(context, {
          cell,
          loadCell,
          matrerial: "full",
          opacity: this._neuronOpacity,
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
    this.applySynapses();
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
        Math.max(this._overlaysMinRadiusInPixels * 1.8, this._overlaysRadius / Math.max(this.spacePerPixel, 1e-6)),
      getOrbit: () => this.cameraManager,
      setHighlightedId: (id) => {
        if (this.painterOverlays) {
          // Hover clears → fall back to host form selection.
          this.painterOverlays.highlightedId = id ?? this._highlightedOverlayId;
        }
      },
      onTransform: this._onOverlayTransform,
      onDragStart: () => this.overlaySurface.beginDrag(),
      onDragEnd: () => {
        this.overlaySurface.endDrag();
        this.pinOverlaysAfterDrag();
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
    context.add(
      clear,
      new TgdPainterState(context, {
        depth: "less",
        cull: "back",
        blend: "alpha",
        children: [this.groupCells, painterSynapses],
      }),
      new TgdPainterClear(context, {
        name: "Clear depth",
        depth: 1,
      }),
      new TgdPainterState(context, {
        depth: "lessOrEqual",
        blend: "add",
        cull: "back",
        children: [this.groupHighlithedCells],
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
   * Snapshot live origin / rotation / tip after drag.
   * Why: host React Query refetch can briefly supply stale or placeholder
   * geometry; pin keeps the painted probe stable until tip matches.
   */
  private pinOverlaysAfterDrag() {
    const withOrigin = this._overlays.find((o) => o.id && o.origin);
    if (!withOrigin?.id || !withOrigin.origin) {
      this._pinnedOverlayOrigin = null;
      return;
    }
    const tip = readOverlayTip(this._overlays, withOrigin.id);
    if (!tip) {
      this._pinnedOverlayOrigin = null;
      return;
    }
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
  signals,
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
