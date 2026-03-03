import {
	type ArrayNumber3,
	TgdCameraPerspective,
	TgdVec3,
} from "@tolokoban/tgd";

type BBox = { min: ArrayNumber3; max: ArrayNumber3 };

export function makeCamera(bbox: BBox) {
	const camera = new TgdCameraPerspective({
		transfo: { distance: 10 },
		far: 100,
		near: 0.1,
		fovy: Math.PI / 8,
		zoom: 1,
	});
	const vecMin = new TgdVec3(bbox.min);
	const vecMax = new TgdVec3(bbox.max);
	const diameter = TgdVec3.distance(vecMin, vecMax);
	const vecDim = new TgdVec3(vecMax).subtract(vecMin);
	const center = new TgdVec3(vecMax).add(vecMin).scale(0.5);
	camera.transfo.position = center;
	const width = vecDim.x;
	const height = vecDim.y;
	camera.fitSpaceAtTarget(width, height);
	// camera.transfo.distance = 1251334;
	camera.near = camera.transfo.distance - diameter * 0.5;
	camera.far = camera.transfo.distance + diameter * 0.5;

	return { camera, width, height };
}
