import { Proximity } from "./proximity";
import { getUniformlyDistributedRays } from "./rays";

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
    console.log("Skip computation for empty bounding boxes.");
    return uvs;
  }

  //   const rays = getUniformlyDistributedRays();
  const proximity = new Proximity(points, bbox, radius);
  const radiusSquare = radius * radius;
  //   const invRadiusSquare = 1 / radiusSquare;
  let indexUV = 1;
  let maxAO = 0;
  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 4) {
    let totalAO = 0;
    proximity.forEachNeighbor(
      pointIndex,
      (_X: number, _Y: number, _Z: number, _R: number, distSquare: number) =>
        (totalAO += radiusSquare - distSquare)
    );
    // Real Ambien Occlusion is disabled for now.
    // for (const [x, y, z] of rays) {
    //   let ao = 0;
    //   proximity.forEachNeighbor(
    //     pointIndex,
    //     (X: number, Y: number, Z: number, R: number, distSquare: number) => {
    //       const distToRaySquare =
    //         (Y * z - z * Y) ** 2 +
    //         (Z * x - X * z) ** 2 +
    //         (X * y - Y * x) ** 2 / (x * x + y * y + z * z);
    //       if (distToRaySquare > R) return true;

    //       ao += radiusSquare - distSquare;
    //       if (ao > radiusSquare) return false;
    //     }
    //   );
    //   totalAO += ao;
    // }
    uvs[indexUV] = totalAO;
    maxAO = Math.max(maxAO, totalAO);
    indexUV += 2;
  }
  const invMaxAO = 1 / maxAO;
  for (let i = 1; i < uvs.length; i += 2) {
    uvs[i] *= invMaxAO;
  }
  return uvs;
}
