import {
  type TgdContext,
  type TgdInputPointerEventMove,
  TgdVec3,
} from "@tolokoban/tgd";

import type {
  MorphoViewerOverlayTransformEvent,
  MorphoViewerWorldOverlay,
} from "../components/types";

type OrbitGate = { enabled: boolean };

/**
 * Host hooks for {@link OverlayInteractionController}.
 *
 * Why callbacks instead of owning the painter: small-circuit and somas-only
 * managers both paint overlays differently; interaction only needs get/set/sync.
 */
type OverlayInteractionOptions = {
  context: TgdContext;
  getOverlays: () => MorphoViewerWorldOverlay[];
  /**
   * Replace overlays (topology / full update). Prefer {@link OverlayInteractionOptions.syncOverlayPositions}
   * during an active drag.
   */
  setOverlays: (overlays: MorphoViewerWorldOverlay[]) => void;
  /** Upload current overlay XYZ to the GPU and paint (no allocations). */
  syncOverlayPositions: () => void;
  /** Approx on-screen point radius used for picking (pixels). */
  getHitRadiusPixels: () => number;
  /** Orbit controller; disabled while dragging so camera does not fight the gesture. */
  getOrbit: () => OrbitGate | null;
  setHighlightedId: (id: string | null) => void;
  onTransform?: (event: MorphoViewerOverlayTransformEvent) => void;
  /** Gesture start — used to freeze the circuit canvas (overlay surface only paints). */
  onDragStart?: () => void;
  /** Optional hook after gesture end (e.g. pin overlays until host API catches up). */
  onDragEnd?: (id: string) => void;
};

type DragMode = "translate" | "rotate";

/** Per-gesture state: live buffers are mutated in place for the whole drag. */
type DragState = {
  id: string;
  mode: DragMode;
  startOrigin: TgdVec3;
  origin: TgdVec3;
  startRotation: { x: number; y: number; z: number };
  currentRotation: { x: number; y: number; z: number };
  /** Immutable snapshot at gesture start. */
  startCoords: Float32Array[];
  /** Live buffers bound into overlay.coordinates (mutated each move). */
  liveCoords: Float32Array[];
  /** Rotate mode only: contacts in local space about the origin. */
  localCoords: Float32Array[];
  groupIndices: number[];
  startGrab: TgdVec3;
  planeAnchor: TgdVec3;
  startPointer: { x: number; y: number };
  /** Orbit enabled flag before this gesture disabled it. */
  orbitWasEnabled: boolean;
};

/** Degrees per CSS pixel for electrode rotation. */
const ROTATE_DEG_PER_PX = 0.35;
/** Priority above TgdControllerCameraOrbit (-1) so electrode drag wins. */
const PRIORITY = 10;
/** Minimum click target in CSS pixels around an electrode marker. */
const MIN_HIT_PIXELS = 14;

/** True when the pointer event should rotate (right-button / Alt / Shift). */
function wantsRotate(evt: {
  shiftKey?: boolean;
  altKey?: boolean;
  buttonRight?: boolean;
}): boolean {
  return Boolean(evt.shiftKey || evt.altKey || evt.buttonRight);
}

/**
 * Pointer interaction for world overlays (electrodes).
 *
 * How:
 * - left-drag → translate on the camera view plane through the grab point
 * - right-drag / Alt / Shift → rotate (Obi-One ZXY; Ry preserved)
 * - mid-gesture: mutate live `Float32Array`s + rAF-coalesced GPU sync
 * - host form notified only on `phase: "end"` (avoids React lag mid-drag)
 *
 * Why not Three.js TransformControls: overlays are TGD point clouds already;
 * keeping transforms in the same buffers avoids a second scene graph.
 */
export class OverlayInteractionController {
  private drag: DragState | null = null;
  private hoverId: string | null = null;
  private attached = false;
  private onTransform?: (event: MorphoViewerOverlayTransformEvent) => void;
  private modifierRotate = false;
  private syncRaf = 0;

  constructor(private readonly options: OverlayInteractionOptions) {
    this.onTransform = options.onTransform;
  }

  /** True while a translate/rotate gesture is active. */
  get isDragging(): boolean {
    return this.drag !== null;
  }

  /**
   * Swap the host transform callback without re-attaching listeners.
   * Why: React `onOverlayTransform` identity changes across renders.
   */
  setOnTransform(onTransform?: (event: MorphoViewerOverlayTransformEvent) => void) {
    this.onTransform = onTransform;
  }

  /**
   * Subscribe to pointer / keyboard with priority above camera orbit.
   * Idempotent; also suppresses the canvas context menu (right-drag rotate).
   */
  attach() {
    if (this.attached) return;
    const { pointer } = this.options.context.inputs;
    pointer.eventHover.addListener(this.handleHover, PRIORITY);
    pointer.eventMoveStart.addListener(this.handleMoveStart, PRIORITY);
    pointer.eventMove.addListener(this.handleMove, PRIORITY);
    pointer.eventMoveEnd.addListener(this.handleMoveEnd, PRIORITY);
    globalThis.addEventListener?.("keydown", this.handleKeyChange);
    globalThis.addEventListener?.("keyup", this.handleKeyChange);
    const { canvas } = this.options.context;
    if (canvas instanceof HTMLCanvasElement) {
      canvas.addEventListener("contextmenu", this.preventContextMenu);
    }
    this.attached = true;
  }

  /** Unsubscribe and cancel any in-flight drag without emitting to the host. */
  detach() {
    if (!this.attached) return;
    const { pointer } = this.options.context.inputs;
    pointer.eventHover.removeListener(this.handleHover);
    pointer.eventMoveStart.removeListener(this.handleMoveStart);
    pointer.eventMove.removeListener(this.handleMove);
    pointer.eventMoveEnd.removeListener(this.handleMoveEnd);
    globalThis.removeEventListener?.("keydown", this.handleKeyChange);
    globalThis.removeEventListener?.("keyup", this.handleKeyChange);
    const { canvas } = this.options.context;
    if (canvas instanceof HTMLCanvasElement) {
      canvas.removeEventListener("contextmenu", this.preventContextMenu);
    }
    this.cancelScheduledSync();
    this.finishDrag(/*emit*/ false);
    this.setHover(null);
    this.attached = false;
  }

  private readonly preventContextMenu = (evt: Event) => {
    evt.preventDefault();
  };

  private readonly handleKeyChange = (evt: KeyboardEvent) => {
    const next = evt.altKey || evt.shiftKey;
    if (next === this.modifierRotate) return;
    this.modifierRotate = next;
    if (!this.drag && this.hoverId) {
      this.setCursor(next ? "move" : "grab");
    }
  };

  private readonly handleHover = (evt: TgdInputPointerEventMove): boolean | undefined => {
    if (this.drag) return true;
    this.modifierRotate = wantsRotate(evt);
    const hit = this.pickOverlay(evt.current.x, evt.current.y);
    this.setHover(hit?.id ?? null);
    if (hit) this.setCursor(this.modifierRotate ? "move" : "grab");
    return undefined;
  };

  private readonly handleMoveStart = (evt: TgdInputPointerEventMove): boolean | undefined => {
    if (evt.buttonMiddle) return;
    const rotate = wantsRotate(evt);
    if (!rotate && !evt.buttonLeft && evt.buttons !== 0) return;

    const hit = this.pickOverlay(evt.current.x, evt.current.y);
    if (!hit) return;

    const overlays = this.options.getOverlays();
    const groupIndices: number[] = [];
    for (let i = 0; i < overlays.length; i++) {
      if (overlays[i].id === hit.id) groupIndices.push(i);
    }
    if (groupIndices.length === 0) return;

    const origin = readOrigin(overlays, hit.id, hit.point);
    const rotation = readRotation(overlays, hit.id);
    const mode: DragMode = rotate ? "rotate" : "translate";

    const planeAnchor = hit.point.clone();
    const startGrab = intersectViewPlane(
      this.options.context,
      evt.current.x,
      evt.current.y,
      planeAnchor
    );

    const startCoords = groupIndices.map((index) =>
      ensureMutableCoords(overlays[index].coordinates)
    );
    // Live buffers stay bound for the whole gesture — mutated in place, never reallocated.
    const liveCoords = startCoords.map((coords) => new Float32Array(coords));
    const localCoords =
      mode === "rotate"
        ? groupIndices.map((_, g) => toLocalCoords(startCoords[g], origin, rotation))
        : [];

    // Copy-on-write so we never mutate the host's React state objects/array.
    const next = overlays.slice();
    for (let g = 0; g < groupIndices.length; g++) {
      const index = groupIndices[g];
      next[index] = {
        ...overlays[index],
        coordinates: liveCoords[g],
        origin: [origin.x, origin.y, origin.z],
        rotation: { ...rotation },
      };
    }
    this.options.setOverlays(next);

    const orbit = this.options.getOrbit();
    const orbitWasEnabled = orbit?.enabled ?? true;
    if (orbit) orbit.enabled = false;

    this.drag = {
      id: hit.id,
      mode,
      startOrigin: origin.clone(),
      origin: origin.clone(),
      startRotation: { ...rotation },
      currentRotation: { ...rotation },
      startCoords,
      liveCoords,
      localCoords,
      groupIndices,
      startGrab,
      planeAnchor,
      startPointer: { x: evt.current.x, y: evt.current.y },
      orbitWasEnabled,
    };

    this.setHover(hit.id);
    this.setCursor(mode === "rotate" ? "move" : "grabbing");
    this.options.onDragStart?.();

    return true;
  };

  private readonly handleMove = (evt: TgdInputPointerEventMove): boolean | undefined => {
    const { drag } = this;
    if (!drag) return;

    if (drag.mode === "translate") {
      this.applyTranslate(evt.current.x, evt.current.y);
    } else {
      this.applyRotate(evt.current.x, evt.current.y);
    }
    // Host form updates only on drop — live paint via syncOverlayPositions.
    this.scheduleSync();
    return true;
  };

  private readonly handleMoveEnd = (): boolean | undefined => {
    if (!this.drag) return;
    this.flushSync();
    this.emit("end");
    this.finishDrag(/*emit*/ false);
    return true;
  };

  /**
   * Translate all groups sharing `drag.id` by the view-plane delta since grab.
   * Preserves relative contact geometry (orientation unchanged).
   */
  private applyTranslate(screenX: number, screenY: number) {
    const { drag } = this;
    if (!drag) return;

    const hit = intersectViewPlane(
      this.options.context,
      screenX,
      screenY,
      drag.planeAnchor
    );
    const dx = hit.x - drag.startGrab.x;
    const dy = hit.y - drag.startGrab.y;
    const dz = hit.z - drag.startGrab.z;

    // `_overlays` is library-owned (cloned on host intake); replace slots, don't
    // mutate the previous group objects (which may still be referenced by React).
    const overlays = this.options.getOverlays();
    for (let g = 0; g < drag.groupIndices.length; g++) {
      const start = drag.startCoords[g];
      const live = drag.liveCoords[g];
      for (let i = 0; i < start.length; i += 3) {
        live[i] = start[i] + dx;
        live[i + 1] = start[i + 1] + dy;
        live[i + 2] = start[i + 2] + dz;
      }
      const index = drag.groupIndices[g];
      overlays[index] = {
        ...overlays[index],
        coordinates: live,
        origin: [
          drag.startOrigin.x + dx,
          drag.startOrigin.y + dy,
          drag.startOrigin.z + dz,
        ],
      };
    }
    drag.origin.x = drag.startOrigin.x + dx;
    drag.origin.y = drag.startOrigin.y + dy;
    drag.origin.z = drag.startOrigin.z + dz;
  }

  /**
   * Rotate contacts about `startOrigin` using Obi-One ZXY Euler.
   * Screen X → −Rz, screen Y → +Rx so motion follows the hand.
   */
  private applyRotate(screenX: number, screenY: number) {
    const { drag } = this;
    if (!drag) return;

    const { camera } = this.options.context;
    const width = Math.max(1, camera.screenWidth);
    const height = Math.max(1, camera.screenHeight);
    const dPxX = ((screenX - drag.startPointer.x) * width) / 2;
    const dPxY = ((screenY - drag.startPointer.y) * height) / 2;

    // Invert screen deltas so rotation follows the hand (not opposite to it).
    const rotation = {
      x: wrapDegrees(drag.startRotation.x + dPxY * ROTATE_DEG_PER_PX),
      y: drag.startRotation.y,
      z: wrapDegrees(drag.startRotation.z - dPxX * ROTATE_DEG_PER_PX),
    };

    // One matrix for the whole gesture frame — all groups share origin/rotation.
    const mat = rotationMatrixZXY(rotation.x, rotation.y, rotation.z);
    const overlays = this.options.getOverlays();
    for (let g = 0; g < drag.groupIndices.length; g++) {
      fromLocalCoordsInto(drag.localCoords[g], drag.startOrigin, mat, drag.liveCoords[g]);
      const index = drag.groupIndices[g];
      overlays[index] = {
        ...overlays[index],
        coordinates: drag.liveCoords[g],
        rotation: { ...rotation },
      };
    }
    drag.origin.from(drag.startOrigin);
    drag.currentRotation = rotation;
  }

  /** Coalesce GPU uploads to one paint per animation frame during drag. */
  private scheduleSync() {
    if (this.syncRaf) return;
    this.syncRaf = globalThis.requestAnimationFrame(() => {
      this.syncRaf = 0;
      this.options.syncOverlayPositions();
    });
  }

  private flushSync() {
    this.cancelScheduledSync();
    this.options.syncOverlayPositions();
  }

  private cancelScheduledSync() {
    if (!this.syncRaf) return;
    globalThis.cancelAnimationFrame(this.syncRaf);
    this.syncRaf = 0;
  }

  /**
   * Notify the host with absolute origin + rotation.
   * Core-web-app only persists on `phase: "end"`.
   */
  private emit(phase: MorphoViewerOverlayTransformEvent["phase"]) {
    const { drag } = this;
    if (!drag || !this.onTransform) return;

    this.onTransform({
      id: drag.id,
      origin: { x: drag.origin.x, y: drag.origin.y, z: drag.origin.z },
      rotation: { ...drag.currentRotation },
      phase,
    });
  }

  private finishDrag(emit: boolean) {
    if (!this.drag) return;
    const { id, orbitWasEnabled } = this.drag;
    if (emit) this.emit("end");
    this.drag = null;
    const orbit = this.options.getOrbit();
    if (orbit) orbit.enabled = orbitWasEnabled;
    this.setCursor(this.hoverId ? (this.modifierRotate ? "move" : "grab") : "");
    this.options.onDragEnd?.(id);
  }

  private setHover(id: string | null) {
    if (this.hoverId === id) return;
    this.hoverId = id;
    this.options.setHighlightedId(id);
    if (!this.drag) {
      this.setCursor(id ? (this.modifierRotate ? "move" : "grab") : "");
    }
  }

  private setCursor(cursor: string) {
    const { canvas } = this.options.context;
    if (canvas instanceof HTMLCanvasElement) {
      canvas.style.cursor = cursor;
    }
  }

  /**
   * Screen-space pick: nearest overlay point within hit radius (NDC → pixels).
   * Groups with `interactive === false` or missing `id` are skipped.
   */
  private pickOverlay(
    screenX: number,
    screenY: number
  ): { id: string; point: TgdVec3 } | null {
    const { context } = this.options;
    const overlays = this.options.getOverlays();
    const { camera } = context;
    const width = Math.max(1, camera.screenWidth);
    const height = Math.max(1, camera.screenHeight);
    const hitPixels = Math.max(MIN_HIT_PIXELS, this.options.getHitRadiusPixels());
    const hitPixelsSq = hitPixels * hitPixels;

    let bestDist = hitPixelsSq;
    let bestId: string | null = null;
    let bestPoint: TgdVec3 | null = null;

    for (const overlay of overlays) {
      if (!overlay.id || overlay.interactive === false) continue;
      const coords = overlay.coordinates;
      for (let i = 0; i < coords.length; i += 3) {
        const x = coords[i];
        const y = coords[i + 1];
        const z = coords[i + 2];
        const clip = camera.apply([x, y, z]);
        if (clip.w === 0) continue;
        const ndcX = clip.x / clip.w;
        const ndcY = clip.y / clip.w;
        const dxPx = ((ndcX - screenX) * width) / 2;
        const dyPx = ((ndcY - screenY) * height) / 2;
        const distSq = dxPx * dxPx + dyPx * dyPx;
        if (distSq < bestDist) {
          bestDist = distSq;
          bestId = overlay.id;
          bestPoint = new TgdVec3(x, y, z);
        }
      }
    }

    if (!bestId || !bestPoint) return null;
    return { id: bestId, point: bestPoint };
  }
}

/**
 * Resolve placement origin for an overlay id (explicit `origin`, else origin-kind coords).
 */
function readOrigin(
  overlays: MorphoViewerWorldOverlay[],
  id: string,
  fallback: TgdVec3
): TgdVec3 {
  for (const overlay of overlays) {
    if (overlay.id !== id) continue;
    if (overlay.origin && overlay.origin.length >= 3) {
      return new TgdVec3(overlay.origin[0], overlay.origin[1], overlay.origin[2]);
    }
    if (overlay.kind === "origin" && overlay.coordinates.length >= 3) {
      const c = overlay.coordinates;
      return new TgdVec3(c[0], c[1], c[2]);
    }
  }
  return fallback.clone();
}

/** Read absolute ZXY rotation for an id, defaulting missing axes to 0. */
function readRotation(
  overlays: MorphoViewerWorldOverlay[],
  id: string
): { x: number; y: number; z: number } {
  for (const overlay of overlays) {
    if (overlay.id !== id || !overlay.rotation) continue;
    return {
      x: overlay.rotation.x ?? 0,
      y: overlay.rotation.y ?? 0,
      z: overlay.rotation.z ?? 0,
    };
  }
  return { x: 0, y: 0, z: 0 };
}

/**
 * Ray ∩ plane through `planePoint` with camera-facing normal.
 * Why: translate stays under the cursor without changing depth arbitrarily.
 */
function intersectViewPlane(
  context: TgdContext,
  screenX: number,
  screenY: number,
  planePoint: TgdVec3
): TgdVec3 {
  const { origin, direction } = context.camera.castRay(screenX, screenY);
  const dir = new TgdVec3(direction);
  const normal = new TgdVec3(context.camera.transfo.axisZ);
  const denom = normal.dot(dir);
  if (Math.abs(denom) < 1e-8) {
    return new TgdVec3(origin);
  }
  const tmp = new TgdVec3(planePoint).subtract(origin);
  const t = normal.dot(tmp) / denom;
  return new TgdVec3(origin).addWithScale(dir, t);
}

/**
 * World → local (inverse ZXY about origin). Used once at rotate-gesture start.
 */
function toLocalCoords(
  world: Float32Array | number[],
  origin: TgdVec3,
  rotation: { x: number; y: number; z: number }
): Float32Array {
  const inv = invertRotationZXY(rotation.x, rotation.y, rotation.z);
  const out = new Float32Array(world.length);
  for (let i = 0; i < world.length; i += 3) {
    const x = world[i] - origin.x;
    const y = world[i + 1] - origin.y;
    const z = world[i + 2] - origin.z;
    const [lx, ly, lz] = applyMat3(inv, x, y, z);
    out[i] = lx;
    out[i + 1] = ly;
    out[i + 2] = lz;
  }
  return out;
}

/**
 * Local → world into `out` (ZXY about origin). Mutates the live GPU buffer source.
 * `mat` is precomputed once per pointer frame via {@link rotationMatrixZXY}.
 */
function fromLocalCoordsInto(
  local: Float32Array,
  origin: TgdVec3,
  mat: Float64Array,
  out: Float32Array
) {
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  const m0 = mat[0];
  const m1 = mat[1];
  const m2 = mat[2];
  const m3 = mat[3];
  const m4 = mat[4];
  const m5 = mat[5];
  const m6 = mat[6];
  const m7 = mat[7];
  const m8 = mat[8];
  for (let i = 0; i < local.length; i += 3) {
    const lx = local[i];
    const ly = local[i + 1];
    const lz = local[i + 2];
    out[i] = m0 * lx + m1 * ly + m2 * lz + ox;
    out[i + 1] = m3 * lx + m4 * ly + m5 * lz + oy;
    out[i + 2] = m6 * lx + m7 * ly + m8 * lz + oz;
  }
}

/** Obi-One extrinsic ZXY Euler (degrees) → 3×3. Must match host placeholder math. */
function rotationMatrixZXY(xDeg: number, yDeg: number, zDeg: number): Float64Array {
  const x = (xDeg * Math.PI) / 180;
  const y = (yDeg * Math.PI) / 180;
  const z = (zDeg * Math.PI) / 180;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  const rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mulMat3(mulMat3(new Float64Array(rz), new Float64Array(rx)), new Float64Array(ry));
}

function invertRotationZXY(xDeg: number, yDeg: number, zDeg: number): Float64Array {
  const m = rotationMatrixZXY(xDeg, yDeg, zDeg);
  return new Float64Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

function mulMat3(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

function applyMat3(m: Float64Array, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ];
}

function wrapDegrees(value: number): number {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function ensureMutableCoords(coords: Float32Array | number[]): Float32Array {
  if (coords instanceof Float32Array) return new Float32Array(coords);
  return Float32Array.from(coords);
}
