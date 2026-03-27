import {
	type TgdAnimation,
	type TgdCameraState,
	type TgdContext,
	TgdControllerCameraOrbit,
	type TgdEvent,
	tgdActionCreateCameraInterpolation,
	tgdEasingFunctionInOutCubic,
} from "@tolokoban/tgd";

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 10;

export class CameraManager {
	public target: Partial<TgdCameraState> = {};

	private animations: TgdAnimation[] = [];
	private orbit: TgdControllerCameraOrbit | null = null;

	constructor(
		private readonly context: TgdContext,
		public readonly eventRestingPosition: TgdEvent<boolean>,
	) {
		this.orbit = new TgdControllerCameraOrbit(context, {
			inertiaOrbit: 1000,
			minZoom: ZOOM_MIN,
			maxZoom: ZOOM_MAX,
		});
		this.orbit.eventChange.addListener(this.hanleOrbitChange);
		eventRestingPosition.dispatch(true);
	}

	resetCamera() {
		const { context } = this;
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
