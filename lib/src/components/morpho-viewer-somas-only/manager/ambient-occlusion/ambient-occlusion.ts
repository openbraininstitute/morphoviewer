import { Proximity } from "./proximity";

import type { ArrayNumber3 } from "@tolokoban/tgd";

export function computeAmbientOcclusion(
  bbox: { min: ArrayNumber3; max: ArrayNumber3 },
  radius: number,
  points: Float32Array,
  uvs: Float32Array,
  intensity = 50
): Float32Array {
  const proximity = new Proximity(bbox, radius);
  for (let i = 0; i < points.length; i += 4) {
    const x = points[i];
    const y = points[i + 1];
    const z = points[i + 2];
    proximity.addPoint([x, y, z]);
  }
  let indexUV = 1;
  for (let i = 0; i < points.length; i += 4) {
    const x = points[i];
    const y = points[i + 1];
    const z = points[i + 2];
    const neighbours = proximity.getNeighbours(x, y, z);
    let xpAO = 0;
    let xnAO = 0;
    let ypAO = 0;
    let ynAO = 0;
    let zpAO = 0;
    let znAO = 0;
    for (const [xx, yy, zz, ao] of neighbours) {
      if (xx < x) xnAO += ao;
      else xpAO += ao;
      if (yy < y) ynAO += ao;
      else ypAO += ao;
      if (zz < z) znAO += ao;
      else zpAO += ao;
    }
    const ao =
      (Math.min(intensity, xnAO) +
        Math.min(intensity, xpAO) +
        Math.min(intensity, ynAO) +
        Math.min(intensity, ypAO) +
        Math.min(intensity, znAO) +
        Math.min(intensity, zpAO)) /
      (intensity * 6);
    uvs[indexUV] = ao;
    indexUV += 2;
  }
  console.log("🐞 [ambient-occlusion@44] uvs =", uvs); // @FIXME: Remove this line written on 2026-06-03 at 18:08
  return uvs;
}
