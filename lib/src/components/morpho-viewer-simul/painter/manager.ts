"use client";

/* eslint-disable no-param-reassign */

import { useEventValue } from "@/utils";
import {
  type TgdCameraState,
  TgdColor,
  TgdContext,
  TgdControllerCameraOrbit,
  TgdEvent,
  TgdMat4,
  type TgdPainterSegmentsData,
  TgdVec3,
  tgdCalcMapRange,
} from "@tolokoban/tgd";
import React from "react";
import type { MorphoViewerSimulContentProps } from "../types/private";
import type {
  MorphoViewerMode,
  MorphoViewerSimulProps,
  MorphoViewerSpikeRecord,
  MorphoViewerSynapsesGroup,
} from "../types/public";
import { makeCamera } from "./camera";
import { Initializer } from "./initializer";
import { computeSectionOffset } from "./math";
import type { MorphologyData } from "./morphology-data";
import { OffscreenPainter } from "./offscreen-painter";
import { Painter } from "./painters";
import { SpikingManager } from "./spiking-manager";
import type { StructureItem } from "./structure";
import { TransitionManager } from "./transition";

interface SelectedItem {
  x: number;
  y: number;
  item: StructureItem | null;
  offset: number;
}

const EMPTY_SEGMENTS: Readonly<Map<number, TgdPainterSegmentsData>> = new Map<
  number,
  TgdPainterSegmentsData
>();

export class PainterManager extends Initializer {
  private static id = 0;

  public minRadius = 2;
  public disableElectrodes = false;
  public readonly id = PainterManager.id++;
  public readonly eventError = new TgdEvent<string>();
  public readonly eventPaint = new TgdEvent<void>();
  public readonly eventHover = new TgdEvent<SelectedItem>();
  public readonly eventTap = new TgdEvent<{
    x: number;
    y: number;
    item: StructureItem | null;
    offset: number;
  }>();
  /**
   * Event for normalized zoom changes.
   * The value is between `-1.0` and `+1.0`
   */
  public readonly eventZoom = new TgdEvent<number>();
  public readonly eventRestingPosition = new TgdEvent<boolean>();
  public readonly eventHintVisible = new TgdEvent<boolean>();
  public readonly eventForbiddenClick = new TgdEvent<void>();

  private spikingManager: SpikingManager | null = null;
  private readonly enventSpikingManagerChange = new TgdEvent<SpikingManager | null>();
  private context: TgdContext | null = null;
  private _disableSynapses = false;
  private _hoverItem: SelectedItem = { x: 0, y: 0, offset: 0, item: null };
  private readonly initialPosition = new TgdVec3();
  private cameraController: TgdControllerCameraOrbit | null = null;
  private synapses: MorphoViewerSynapsesGroup[] = [];
  private data: MorphologyData | null = null;
  /**
   * When is the last time the camera moved?
   * We use this to prevent a quick camera moved
   * from being interpreted as a click.
   * Because a click will bring a modal window to add
   * recording.
   */
  private lastCameraChangeTimestamp = 0;
  /**
   * Remember the camera position, so if we initialize with the
   * same morphology, we can restore camera state.
   */
  private lastCameraState: TgdCameraState | null = null;
  private _clickable = true;
  private _backgroundColor = "#000000";
  private _mode: MorphoViewerMode = "3d";
  private clearColor = new TgdColor(0, 0, 0);
  private view: TransitionManager | null = null;
  private _spikes: MorphoViewerSpikeRecord[] = [];

  constructor() {
    super();
  }

  useSpikingManager() {
    const spikingManager = useEventValue(this.spikingManager, this.enventSpikingManagerChange);
    return spikingManager;
  }

  get spikes(): MorphoViewerSpikeRecord[] {
    return this._spikes;
  }
  set spikes(spikes: MorphoViewerSpikeRecord[]) {
    if (this._spikes === spikes) return;

    this._spikes = spikes;
    const { spikingManager } = this;
    if (spikingManager) spikingManager.spikes = spikes;
  }

  get mode(): MorphoViewerMode {
    return this._mode;
  }
  set mode(mode: MorphoViewerMode) {
    if (this._mode === mode) return;

    this._mode = mode;
    if (this.view) {
      this.view.mode = mode;
    }
  }

  get backgroundColor() {
    return this._backgroundColor;
  }
  set backgroundColor(backgroundColor: string) {
    if (backgroundColor === this._backgroundColor) return;

    this._backgroundColor = backgroundColor;
    this.clearColor.parse(backgroundColor);
  }

  get clickable() {
    return this._clickable;
  }
  set clickable(value: boolean) {
    this._clickable = value;
    this.context?.paint();
  }

  get hoverItem() {
    return this._hoverItem;
  }
  set hoverItem(value: SelectedItem) {
    this._hoverItem = value;
    this.eventHover.dispatch(value);
  }

  /**
   * This normalized zoom is between -1 and +1.
   */
  get zoom() {
    const { cameraController, context } = this;
    if (!context || !cameraController) return 0;

    return this.toNormalizedZoom(cameraController.zoom);
  }

  set zoom(value: number) {
    const { cameraController } = this;
    if (!cameraController) return;

    if (Math.abs(value - this.zoom) < 1e-6) return;

    if (value !== 0) this.eventRestingPosition.dispatch(false);
    const zoom = this.toControllerZoom(value);
    cameraController.zoom = zoom;
    this.eventZoom.dispatch(value);
    this.context?.paint();
  }

  readonly zoomOut = () => {
    this.zoom -= 0.1;
  };

  readonly zoomIn = () => {
    this.zoom += 0.1;
  };

  getCameraMatrix(): Readonly<TgdMat4> {
    const { context } = this;
    if (!context) return new TgdMat4();

    const { camera } = context;
    return new TgdMat4(camera.matrixProjection).multiply(camera.matrixModelView);
  }

  readonly resetCamera = () => {
    const { cameraController, context } = this;
    if (!context || !cameraController) return;

    const { zoom } = this;
    cameraController.reset(0.3333, {
      onAction: (t: number) => {
        this.eventZoom.dispatch(tgdCalcMapRange(t, 0, 1, zoom, 0));
      },
      onEnd: () => this.eventRestingPosition.dispatch(true),
    });
  };

  delete() {
    this.context?.delete();
    this.context = null;
    this.view?.eventResetCamera.removeListener(this.resetCamera);
  }

  /**
   * We look for the segment defined by `offset` and
   * we return the 3D point in it.
   * @param sectionName
   * @param offset
   */
  getSectionCoordinates(sectionName: string, offset: number): TgdVec3 {
    const structure = this.data?.structure;
    if (!structure) return new TgdVec3();

    const segments = structure.getSegmentsOfSection(sectionName) ?? [];
    const totalDistance = segments.reduce((dist, item) => dist + item.segmentLength, 0);
    const targetDistance = totalDistance * offset;
    let distance = 0;
    for (const segment of segments) {
      const previousDistance = distance;
      distance += segment.segmentLength;
      if (distance >= targetDistance) {
        const seg1 = this.data?.segments3D.get(segment.index);
        const seg2 = this.data?.segmentsDendrogram.get(segment.index);
        if (!seg1 || !seg2) continue;

        const segmentOffset =
          segment.segmentLength > 0
            ? (targetDistance - previousDistance) / segment.segmentLength
            : 0.5;
        const mix = this.view?.mix ?? 0;
        const start: TgdVec3 = TgdVec3.newFromMix(seg1.getXYZR0(0), seg2.getXYZR0(0), mix);
        const end: TgdVec3 = TgdVec3.newFromMix(seg1.getXYZR1(0), seg2.getXYZR1(0), mix);
        const point = TgdVec3.newFromMix(
          start, // segment.start,
          end, // segment.end,
          segmentOffset,
        );
        return point;
      }
    }
    return new TgdVec3();
  }

  getSegment(sectionName: string, sectionOffset: number): StructureItem | null {
    const structure = this.data?.structure;
    if (!structure) return null;

    const segments = structure.getSegmentsOfSection(sectionName);
    if (!segments) return null;

    const totalDistance = segments.reduce((dist, item) => dist + item.segmentLength, 0);
    const targetDistance = totalDistance * sectionOffset;
    let distance = 0;
    for (const segment of segments) {
      distance += segment.segmentLength;
      if (distance >= targetDistance) return segment;
    }
    return null;
  }

  showSynapses(synapses: MorphoViewerSynapsesGroup[]) {
    this.synapses = synapses;
    const { view } = this;
    if (view) view.synapses = synapses;
  }

  private fitCamera() {
    const { data } = this;
    if (!data) return;

    const { view, context } = this;
    if (!context) return;

    const { structure } = data;
    const [xc, yc] = structure.center;
    const bbox = structure.bboxDendrites;
    const width = 2.1 * Math.max(Math.abs(bbox.max[0] - xc), Math.abs(bbox.min[0] - xc));
    const height = 2.1 * Math.max(Math.abs(bbox.max[1] - yc), Math.abs(bbox.min[1] - yc));
    if (view) {
      view.widthAtTarget = width;
      view.heightAtTarget = height;
    }
  }

  protected initialize(canvas: HTMLCanvasElement, data: MorphologyData) {
    try {
      this.data = data;
      const context = this.initContext(canvas, data);
      this.spikingManager = new SpikingManager(context);
      this.spikingManager.spikes = this.spikes;
      context.paintOneTime({
        paint: () => {
          this.enventSpikingManagerChange.dispatch(this.spikingManager);
        },
      });
      const view = new TransitionManager(context, { clearColor: this.backgroundColor });
      view.eventResetCamera.addListener(this.resetCamera);
      context.add(view);
      this.view = view;
      this.initPainter(context, data, view, this.spikingManager);
      context.eventPaint.addListener(this.handlePaint);
      this.initOffscreen(context, data, view);
      this.eventHintVisible.dispatch(false);
      this.fitCamera();
      context.debugHierarchy();
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  private initContext(canvas: HTMLCanvasElement, data: MorphologyData) {
    const context = new TgdContext(canvas, {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: false,
    });
    this.context = context;
    context.eventWebGLContextRestored.addListener(() => {
      this.delete();
      globalThis.requestAnimationFrame(() => this.initialize(canvas, data));
    });
    const { camera, zoomMin, zoomMax } = makeCamera(data.structure);
    context.camera = camera;
    this.initialPosition.from(context.camera.transfo.position);
    this.initCameraController(context, zoomMin, zoomMax);
    if (this.lastCameraState) {
      // Restore camera state
      context.camera.setCurrentState(this.lastCameraState);
      this.eventRestingPosition.dispatch(false);
    }
    context.inputs.pointer.eventTapMultiple.addListener(() => {
      console.log(context.camera.toCode());
      console.log("🐞 [manager@340] this.context =", this.context); // @FIXME: Remove this line written on 2026-03-12 at 11:52
      this.context?.debugHierarchy();
    });
    context.paint();
    return context;
  }

  private initPainter(
    context: TgdContext,
    data: MorphologyData,
    view: TransitionManager,
    spikingManager: SpikingManager,
  ) {
    const painter = new Painter(context, data, spikingManager);
    view.minRadius = this.minRadius;
    view.painter = painter;
    painter.synapses = this.synapses;
    return painter;
  }

  /**
   * We paint a thicker representation of the neuron in an offsceen canvas.
   * The color of each segment is the ID of this segment. So we must NOT
   * use anti-aliasing, or any shading (other than flat).
   */
  private initOffscreen(context: TgdContext, data: MorphologyData, view: TransitionManager) {
    view.offscreen = new OffscreenPainter(context);
    view.offscreen.data = data;
    context.inputs.pointer.eventHover.addListener((evt) => {
      const { data } = this;
      const { painter } = view;
      if (!painter || !data) return;

      const { x, y } = evt.current;
      const item = view.offscreen?.getItemAt(x, y) ?? null;
      painter.highlight(null);
      let offset = 0;
      if (item) {
        const segment = this.segments.get(item.index);
        painter.highlight(segment);
        offset = computeSectionOffset(data.structure, item, context.camera, x, y);
      } else {
        painter.highlight(null);
      }
      this.hoverItem = { x, y, offset, item: item ?? null };
      this.context?.paint();
      this.eventHintVisible.dispatch(true);
    });
    context.inputs.pointer.eventTap.addListener((evt) => {
      if (this.disableElectrodes) return;

      if (!this.clickable) {
        this.eventForbiddenClick.dispatch();
        return;
      }

      // Prevent camera movement to be interpreted as a click.
      if (Date.now() - this.lastCameraChangeTimestamp < 300) return;

      const { data } = this;
      if (!data) return;

      const { x, y } = evt;
      const item = view.offscreen?.getItemAt(x, y) ?? null;
      if (item) {
        const offset = computeSectionOffset(data.structure, item, view.context.camera, x, y);
        this.hoverItem = { x, y, offset, item: item ?? null };
        this.eventTap.dispatch({
          x,
          y,
          item: this.hoverItem.item,
          offset,
        });
        this.eventHintVisible.dispatch(false);
      }
    });
  }

  private initCameraController(context: TgdContext, minZoom: number, maxZoom: number) {
    if (this.cameraController) this.cameraController.detach();
    const cameraController = new TgdControllerCameraOrbit(context, {
      inertiaOrbit: 1000,
      inertiaZoom: 250,
      minZoom,
      maxZoom,
      speedZoom: 1,
      onZoomRequest: ({ zoom }) => {
        this.eventZoom.dispatch(this.toNormalizedZoom(zoom));
        return true;
      },
    });
    this.cameraController = cameraController;
    cameraController.eventChange.addListener(() => {
      // Remember last camera movement to prevent false clicks.
      this.lastCameraChangeTimestamp = Date.now();
      this.eventRestingPosition.dispatch(false);
    });
  }

  private get segments() {
    const { data } = this;
    if (!data) return EMPTY_SEGMENTS;

    if (this.mode === "3d") return data.segments3D;
    else return data.segmentsDendrogram;
  }

  private readonly handlePaint = () => {
    const { context } = this;
    if (!context) return;

    this.lastCameraState = context.camera.getCurrentState();
    this.eventPaint.dispatch();
  };

  /**
   * @param controllerZoom Between `this.controller.minZoom` and `this.controller.maxZoom`.
   * @returns The normalized zoom between -1 and +1.
   */
  private toNormalizedZoom(controllerZoom: number) {
    const { cameraController } = this;
    if (!cameraController) return 0;

    const { minZoom, maxZoom } = cameraController;
    if (controllerZoom < 1) {
      return tgdCalcMapRange(controllerZoom, 1, minZoom, 0, -1, true);
    }
    return tgdCalcMapRange(controllerZoom, 1, maxZoom, 0, +1, true);
  }

  /**
   * @param normalizedZoom Between -1 and +1.
   * @returns The controller zoom between `this.controller.minZoom` and `this.controller.maxZoom`.
   */
  private toControllerZoom(normalizedZoom: number) {
    const { cameraController } = this;
    if (!cameraController) return 1;

    const { minZoom, maxZoom } = cameraController;
    if (normalizedZoom < 0) {
      return tgdCalcMapRange(normalizedZoom, 0, -1, 1, minZoom, true);
    }
    return tgdCalcMapRange(normalizedZoom, 0, +1, 1, maxZoom, true);
  }
}

export function useWebglNeuronSelector({
  morphology,
  spikes,
  minRadius,
  synapses,
}: MorphoViewerSimulProps) {
  const refPainter = React.useRef<PainterManager | null>(null);
  if (!refPainter.current) {
    const manager = new PainterManager();
    refPainter.current = manager;
    manager.morphology = morphology;
    manager.spikes = spikes ?? [];
    manager.showSynapses(synapses ?? []);
  }

  React.useEffect(() => {
    if (refPainter.current) {
      refPainter.current.spikes = spikes ?? [];
    }
  }, [spikes]);

  React.useEffect(() => {
    refPainter.current?.showSynapses(synapses ?? []);
  }, [synapses]);

  // Update morphology when it changes (even if object reference changes)
  React.useEffect(() => {
    if (refPainter.current) {
      refPainter.current.morphology = morphology;
    }
  }, [morphology]);

  React.useEffect(() => {
    if (refPainter.current) {
      refPainter.current.minRadius = minRadius ?? 2;
    }
  }, [minRadius]);

  // Cleanup only on unmount
  React.useEffect(() => {
    return () => {
      const painterManager = refPainter.current;
      if (!painterManager) return;

      painterManager.delete();
    };
  }, []); // Empty dependency array - only run on mount/unmount

  return refPainter.current;
}

export function usePainterController(props: MorphoViewerSimulContentProps) {
  const { painterManager: painter, synapses, disableClick, backgroundColor } = props;
  React.useEffect(() => {
    const action = () => {
      painter.eventError.dispatch(
        "You cannot add recordings nor move injection while a simulation is running!",
      );
    };
    painter.eventForbiddenClick.addListener(action);
    return () => painter.eventForbiddenClick.removeListener(action);
  }, [painter]);

  React.useEffect(() => {
    if (painter) {
      painter.clickable = disableClick !== true;
    }
  }, [disableClick, painter]);

  React.useEffect(() => {
    painter.showSynapses(synapses ?? []);
  }, [synapses, painter]);

  React.useEffect(() => {
    painter.backgroundColor = backgroundColor ?? "#000000";
  }, [backgroundColor, painter]);
}
