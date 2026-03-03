import {
	type ArrayNumber3,
	TgdCameraPerspective,
	TgdVec3,
} from "@tolokoban/tgd";

type BBox = { min: ArrayNumber3; max: ArrayNumber3 };

export function makeCamera(bbox: BBox) {
	// const vecMin = new TgdVec3(bbox.min);
	// const vecMax = new TgdVec3(bbox.max);
	// const vecDim = new TgdVec3(vecMax).subtract(vecMin);
	// const center = new TgdVec3(vecMax).add(vecMin).scale(0.5);
	// const camera = new TgdCameraPerspective({
	// 	near: 1,
	// 	transfo: {
	// 		position: center,
	// 	},
	// 	zoom: 1,
	// });
	// camera.fitSpaceAtTarget(vecDim.x, vecDim.y);
	// camera.far = camera.transfo.distance * 2;
	// camera.zoom = 0.5;
	// camera.debug();

	const camera = new TgdCameraPerspective({
		transfo: { distance: 10 },
		far: 100,
		near: 0.1,
		fovy: Math.PI / 8,
		zoom: 1,
	});
	const vecMin = new TgdVec3(bbox.min);
	const vecMax = new TgdVec3(bbox.max);
	const vecDim = new TgdVec3(vecMax).subtract(vecMin);
	const center = new TgdVec3(vecMax).add(vecMin).scale(0.5);
	camera.transfo.position = center;
	// context.camera.transfo.setPosition(0, 0, 0)
	camera.transfo.distance = vecDim.z * 3;
	camera.near = 1;
	camera.far = vecDim.z * 6;

	return camera;
}
