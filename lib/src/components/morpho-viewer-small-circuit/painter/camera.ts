import {
  type TgdAnimation,
  TgdCameraOrthographic,
  type TgdCameraState,
  type TgdContext,
  TgdControllerCameraOrbit,
  type TgdEvent,
  type TgdQuat,
  tgdActionCreateCameraInterpolation,
  tgdEasingFunctionInOutCubic,
} from "@tolokoban/tgd";

import type { MorphoViewerSignalCameraResetOptions } from "@/components/signals";

/** Zoom range the orbit controller enforces. Exported so a host control matches it. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 100;

const MOVE_DURATION_IN_SECONDS = 0.5;
/** A turn is a small move, so it is quicker. */
const TURN_DURATION_IN_SECONDS = 0.3;

/** Clamp a zoom to the allowed range. `NaN` has no side, so it takes the minimum. */
export function clampZoom(zoom: number): number {
  if (Number.isNaN(zoom)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

export class CameraManager {
  public target: Partial<TgdCameraState> = {};

  private animations: TgdAnimation[] = [];
  private orbit: TgdControllerCameraOrbit | null = null;
  private savedSpeedOrbit: number | null = null;
  private _rotationLocked = false;

  constructor(
    private readonly context: TgdContext,
    public readonly eventRestingPosition: TgdEvent<boolean>
  ) {
    const camera = new TgdCameraOrthographic();
    context.camera = camera;
    this.orbit = new TgdControllerCameraOrbit(context, {
      inertiaOrbit: 1000,
      minZoom: ZOOM_MIN,
      maxZoom: ZOOM_MAX,
    });
    this.orbit.eventChange.addListener(this.hanleOrbitChange);
    eventRestingPosition.dispatch(true);
  }

  get enabled(): boolean {
    return this.orbit?.enabled ?? false;
  }

  /** Freeze rotation while keeping zoom and pan, for flat views like the dendrogram. */
  set rotationLocked(locked: boolean) {
    this._rotationLocked = locked;
    const { orbit } = this;
    if (!orbit) return;
    if (locked) {
      if (this.savedSpeedOrbit === null) this.savedSpeedOrbit = orbit.speedOrbit;
      orbit.speedOrbit = 0;
    } else if (this.savedSpeedOrbit !== null) {
      orbit.speedOrbit = this.savedSpeedOrbit;
      this.savedSpeedOrbit = null;
    }
  }
  set enabled(enabled: boolean) {
    if (this.orbit) this.orbit.enabled = enabled;
  }

  resetCamera(options: MorphoViewerSignalCameraResetOptions = {}) {
    this.target.zoom = options.zoom ?? this.target.zoom;
    this.animateTo(this.target);
  }

  /**
   * Move to the stored target with a one-off zoom, leaving that target untouched.
   *
   * A view mode frames the camera for as long as it lasts, so its zoom must not become the
   * new resting state: `resetCamera()` afterwards still restores the captured framing.
   * Passing `undefined` goes back to that framing.
   */
  applyZoom(zoom: number | undefined) {
    this.animateTo({ ...this.target, zoom: zoom ?? this.target.zoom });
  }

  /**
   * Turn to an orientation, keeping the framing.
   *
   * Uses the same animation list as the other moves, so a reset cancels a turn.
   * Only the orientation goes into `target`, so a reset keeps the captured framing.
   */
  turnTo(orientation: Readonly<TgdQuat>) {
    if (this._rotationLocked) return;

    this.target.orientation = orientation;
    this.animateTo({ orientation }, TURN_DURATION_IN_SECONDS);
  }

  private animateTo(state: Partial<TgdCameraState>, duration = MOVE_DURATION_IN_SECONDS) {
    const { context } = this;
    context.animCancelArray(this.animations);
    this.animations = context.animSchedule({
      duration,
      easingFunction: tgdEasingFunctionInOutCubic,
      action: tgdActionCreateCameraInterpolation(context.camera, state),
      onEnd: () => this.eventRestingPosition.dispatch(true),
    });
  }

  delete() {
    this.orbit?.detach();
    this.orbit = null;
    this.context.animCancelArray(this.animations);
  }

  private readonly hanleOrbitChange = () => {
    this.eventRestingPosition.dispatch(false);
  };
}
