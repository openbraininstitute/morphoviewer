import {
  type ArrayNumber3,
  type TgdCamera,
  TgdCameraPerspective,
  TgdVec3,
} from "@tolokoban/tgd";

interface BoundingBox {
  min: ArrayNumber3;
  max: ArrayNumber3;
  center: ArrayNumber3;
}

export function makeCamera({
  bboxDendrites,
  zoomMin,
  zoomMax,
  center,
}: {
  bboxDendrites: BoundingBox;
  zoomMin: number;
  zoomMax: number;
  center: Readonly<ArrayNumber3>;
}): { camera: TgdCamera; zoomMin: number; zoomMax: number } {
  const sizeX = bboxDendrites.max[0] - bboxDendrites.min[0];
  const sizeY = bboxDendrites.max[1] - bboxDendrites.min[1];
  const sizeZ = bboxDendrites.max[2] - bboxDendrites.min[2];
  const size = Math.max(sizeX, sizeY, sizeZ);
  const camera = new TgdCameraPerspective({
    transfo: {
      distance: size,
      position: new TgdVec3(center),
    },
    near: 1,
    far: 3 * size,
  });
  return { camera, zoomMin, zoomMax };
}
