"use client";
/* eslint-disable no-param-reassign */

import {
	type TgdCameraState,
	TgdContext,
	TgdControllerCameraOrbit,
	TgdEvent,
	TgdMat4,
	TgdPainterLogic,
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
} from "../types/public";
import { makeCamera } from "./camera";
import { Initializer } from "./initializer";
import { computeSectionOffset } from "./math";
import type { MorphologyData } from "./morphology-data";
import { OffscreenPainter } from "./offscreen-painter";
import { Painter } from "./painters";
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

	private readonly view = new TransitionManager();

	private _disableSynapses = false;

	private _hoverItem: SelectedItem = { x: 0, y: 0, offset: 0, item: null };

	private readonly initialPosition = new TgdVec3();

	private cameraController: TgdControllerCameraOrbit | null = null;

	private synapses: Array<{ color: string; data: Float32Array }> = [];

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
	private _spikes: MorphoViewerSpikeRecord[] = [];
	private _spikesIndex = 0;
	private _clickable = true;

	constructor() {
		super();
		this.view.eventResetCamera.addListener(this.resetCamera);
	}

	get spikesIndex() {
		return this._spikesIndex;
	}
	set spikesIndex(value: number) {
		this._spikesIndex = value;
		const { painter } = this.view;
		if (painter) painter.spike = this._spikes[value];
	}

	get spikes() {
		return this._spikes;
	}
	set spikes(value: MorphoViewerSpikeRecord[]) {
		this._spikes = value;
		const { painter } = this.view;
		if (painter) painter.spike = value[this._spikesIndex];
	}

	get mode() {
		return this.view.mode;
	}

	set mode(value: MorphoViewerMode) {
		this.view.mode = value;
	}

	get disableSynapses() {
		return this._disableSynapses;
	}

	set disableSynapses(value: boolean) {
		this._disableSynapses = value;
		const { painter } = this.view;
		if (painter) painter.synapsesEnabled = !value;
	}

	get clickable() {
		return this._clickable;
	}

	set clickable(value: boolean) {
		this._clickable = value;
		this.view.context?.paint();
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
		const { view, cameraController } = this;
		const { context } = view;
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
		this.view.paint();
	}

	readonly zoomOut = () => {
		this.zoom -= 0.1;
	};

	readonly zoomIn = () => {
		this.zoom += 0.1;
	};

	getCameraMatrix(): Readonly<TgdMat4> {
		const { context } = this.view;
		if (!context) return new TgdMat4();

		const { camera } = context;
		return new TgdMat4(camera.matrixProjection).multiply(
			camera.matrixModelView,
		);
	}

	readonly resetCamera = () => {
		const { view, cameraController } = this;
		const { context } = view;
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
		this.view.delete();
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
		const totalDistance = segments.reduce(
			(dist, item) => dist + item.length,
			0,
		);
		const targetDistance = totalDistance * offset;
		let distance = 0;
		for (const segment of segments) {
			const previousDistance = distance;
			distance += segment.length;
			if (distance >= targetDistance) {
				const seg1 = this.data?.segments3D.get(segment.index);
				const seg2 = this.data?.segmentsDendrogram.get(segment.index);
				if (!seg1 || !seg2) continue;

				const segmentOffset =
					(targetDistance - previousDistance) / segment.length;
				const start: TgdVec3 = TgdVec3.newFromMix(
					seg1.getXYZR0(0),
					seg2.getXYZR0(0),
					this.view.mix,
				);
				const end: TgdVec3 = TgdVec3.newFromMix(
					seg1.getXYZR1(0),
					seg2.getXYZR1(0),
					this.view.mix,
				);
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

		const totalDistance = segments.reduce(
			(dist, item) => dist + item.length,
			0,
		);
		const targetDistance = totalDistance * sectionOffset;
		let distance = 0;
		for (const segment of segments) {
			distance += segment.length;
			if (distance >= targetDistance) return segment;
		}
		return null;
	}

	showSynapses(synapses: Array<{ color: string; data: Float32Array }>) {
		this.synapses = synapses;
		const { context, painter } = this.view;
		if (!context || !painter) return;

		painter.synapses = synapses;
	}

	private fitCamera() {
		const { data } = this;
		if (!data) return;

		const { context } = this.view;
		if (!context) return;

		const { structure } = data;
		const [xc, yc] = structure.center;
		const bbox = structure.bboxDendrites;
		const width =
			2.1 * Math.max(Math.abs(bbox.max[0] - xc), Math.abs(bbox.min[0] - xc));
		const height =
			2.1 * Math.max(Math.abs(bbox.max[1] - yc), Math.abs(bbox.min[1] - yc));
		this.view.widthAtTarget = width;
		this.view.heightAtTarget = height;
	}

	protected initialize(canvas: HTMLCanvasElement, data: MorphologyData) {
		this.data = data;
		const context = this.initContext(canvas, data);
		this.initPainter(context, data);
		context.eventPaint.addListener(this.handlePaint);
		this.initOffscreen(context, data);
		this.eventHintVisible.dispatch(false);
		this.fitCamera();
	}

	private initContext(canvas: HTMLCanvasElement, data: MorphologyData) {
		const context = new TgdContext(canvas, {
			alpha: false,
			antialias: true,
		});
		context.eventWebGLContextRestored.addListener(() => {
			this.delete();
			globalThis.requestAnimationFrame(() => this.initialize(canvas, data));
		});
		this.view.context = context;
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
			this.view.painter?.debugHierarchy();
		});
		return context;
	}

	private initPainter(context: TgdContext, data: MorphologyData) {
		const painter = new Painter(context, data);
		this.view.painter = painter;
		painter.synapses = this.synapses;
		this.view.painter = painter;
		return painter;
	}

	/**
	 * We paint a thicker representation of the neuron in an offsceen canvas.
	 * The color of each segment is the ID of this segment. So we must NOT
	 * use anti-aliasing, or any shading (other than flat).
	 */
	private initOffscreen(context: TgdContext, data: MorphologyData) {
		const { view } = this;
		view.offscreen = new OffscreenPainter(context);
		view.offscreen.data = data;
		context.inputs.pointer.eventHover.addListener((evt) => {
			const { data } = this;
			const { painter } = view;
			if (!painter || !data) return;

			const { x, y } = evt.current;
			const item = view.offscreen?.getItemAt(x, y) ?? null;
			if (item !== this.hoverItem.item) {
				painter.highlight(null);
				let offset = 0;
				if (item) {
					const segments = this.segments.get(item.index);
					painter.highlight(segments);
					offset = computeSectionOffset(
						data.structure,
						item,
						context.camera,
						x,
						y,
					);
				} else {
					painter.highlight(null);
				}
				this.hoverItem = { x, y, offset, item: item ?? null };
				view.paint();
				this.eventHintVisible.dispatch(true);
			}
		});
		context.inputs.pointer.eventTap.addListener((evt) => {
			if (this.disableElectrodes) return;

			if (!this.clickable) {
				this.eventForbiddenClick.dispatch();
				return;
			}

			// Prevent camera movement to be interpreted as a click.
			if (Date.now() - this.lastCameraChangeTimestamp < 300) return;

			const { data, view } = this;
			if (!view.context || !data) return;

			const { x, y } = evt;
			const item = view.offscreen?.getItemAt(x, y) ?? null;
			console.log("🐞 [manager@373] item, x, y =", item, x, y); // @FIXME: Remove this line written on 2026-02-13 at 17:41
			if (item) {
				const offset = computeSectionOffset(
					data.structure,
					item,
					view.context.camera,
					x,
					y,
				);
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

	private initCameraController(
		context: TgdContext,
		minZoom: number,
		maxZoom: number,
	) {
		if (this.cameraController) this.cameraController.detach();
		const cameraController = new TgdControllerCameraOrbit(context, {
			inertiaOrbit: 500,
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
		const { context } = this.view;
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
}: MorphoViewerSimulProps) {
	const refPainter = React.useRef<PainterManager | null>(null);
	if (!refPainter.current) {
		const manager = new PainterManager();
		refPainter.current = manager;
		manager.morphology = morphology;
		manager.spikes = spikes ?? [];
	}

	// Update morphology when it changes (even if object reference changes)
	React.useEffect(() => {
		if (refPainter.current) {
			refPainter.current.morphology = morphology;
		}
	}, [morphology]);

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
	const { painterManager: painter, synapses, disableClick } = props;
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
}
