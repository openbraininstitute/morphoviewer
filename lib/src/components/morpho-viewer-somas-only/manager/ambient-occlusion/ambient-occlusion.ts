import { Proximity } from "./proximity";

import type { ArrayNumber3 } from "@tolokoban/tgd";

export function computeAmbientOcclusion(
  bbox: { min: ArrayNumber3; max: ArrayNumber3 },
  radius: number,
  points: Float32Array,
  uvs: Float32Array,
  intensity = 0.5
): Float32Array {
  if (bbox.min[0] > bbox.max[0]) {
    // Skip computation for empty bounding boxes.
    return uvs;
  }

  const proximity = new Proximity(points, bbox, radius);
  const invRadiusSquare = 1 / (radius * radius);
  let indexUV = 1;
  let maxAO = 0;
  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 4) {
    let ao = 0;
    let count = 0;
    let vecX = 0;
    let vecY = 0;
    let vecZ = 0;
    proximity.forEachNeighbor(
      pointIndex,
      (x: number, y: number, z: number, _r: number, distSquare: number) => {
        count++;
        const falloff = 1 - distSquare * invRadiusSquare;
        const invDistQuare = 1 / distSquare;
        vecX += x * invDistQuare * falloff;
        vecY += y * invDistQuare * falloff;
        vecZ += z * invDistQuare * falloff;
        ao += falloff;
      }
    );
    if (count > 0) {
      const invCount = 1 / count;
      vecX *= invCount;
      vecY *= invCount;
      vecZ *= invCount;
      ao *= 1 - (vecX * vecX + vecY * vecY + vecZ * vecZ);
    } else {
      ao = 0;
    }
    maxAO = Math.max(ao, maxAO);
    uvs[indexUV] = ao;
    indexUV += 2;
  }
  const invMaxAO = 1 / maxAO;
  for (let i = 1; i < uvs.length; i += 2) {
    uvs[i] *= invMaxAO;
  }
  return uvs;
}
