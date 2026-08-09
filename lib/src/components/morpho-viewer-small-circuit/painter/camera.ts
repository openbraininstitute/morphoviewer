import {
  type TgdAnimation,
  TgdCameraOrthographic,
  type TgdCameraState,
  type TgdContext,
  TgdControllerCameraOrbit,
  type TgdEvent,
  tgdActionCreateCameraInterpolation,
  tgdEasingFunctionInOutCubic,
} from "@tolokoban/tgd";

import type { MorphoViewerSignalCameraResetOptions } from "@/components/signals";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 100;

export class CameraManager {
  public target: Partial<TgdCameraState> = {};

  private animations: TgdAnimation[] = [];
  private orbit: TgdControllerCameraOrbit | null = null;
  private savedSpeedOrbit: number | null = null;

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
  get rotationLocked(): boolean {
    return this.orbit !== null && this.orbit.speedOrbit === 0;
  }
  set rotationLocked(locked: boolean) {
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
    const { context } = this;
    this.target.zoom = options.zoom ?? this.target.zoom;
    context.animCancelArray(this.animations);
    this.animations = context.animSchedule({
      duration: 0.5,
      easingFunction: tgdEasingFunctionInOutCubic,
      action: tgdActionCreateCameraInterpolation(context.camera, this.target),
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
