import { type ArrayNumber3, TgdCameraPerspective } from "@tolokoban/tgd";

type BBox = { min: ArrayNumber3; max: ArrayNumber3 };

export function makeCamera(bbox: BBox) {
	const diag = computeDiagonal(bbox);
	const position = computeCenter(bbox);
	const camera = new TgdCameraPerspective({
		near: 1,
		far: 2 * diag + 2,
		transfo: {
			position,
			distance: diag + 1,
		},
	});
	return camera;
}

function computeDiagonal(bbox: BBox) {
	const [x0, y0, z0] = bbox.min;
	const [x1, y1, z1] = bbox.max;
	const x = x1 - x0;
	const y = y1 - y0;
	const z = z1 - z0;
	return Math.sqrt(x * x + y * y + z * z);
}

function computeCenter(bbox: BBox): ArrayNumber3 {
	const [x0, y0, z0] = bbox.min;
	const [x1, y1, z1] = bbox.max;
	return [(x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5];
}
