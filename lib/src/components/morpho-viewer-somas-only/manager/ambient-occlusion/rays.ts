import { TgdVec3 } from "@tolokoban/tgd";

const rays: TgdVec3[] = [];

export function getUniformlyDistributedRays(): Readonly<TgdVec3[]> {
  const STEPS_PER_QUARTER = 3;
  if (rays.length === 0) {
    const sectors = (STEPS_PER_QUARTER - 1) * 4;
    for (let step = 0; step < STEPS_PER_QUARTER; step++) {
      const phi = ((Math.PI / 2) * step) / (STEPS_PER_QUARTER - 1);
      const z = Math.sin(phi);
      const r = Math.cos(phi);
      for (let sector = 0; sector < sectors; sector++) {
        const theta = (2 * Math.PI * sector) / (sectors - 1);
        const x = r * Math.cos(theta);
        const y = r * Math.sin(theta);
        rays.push(new TgdVec3(x, y, z));
        if (z > 0) {
          rays.push(new TgdVec3(x, y, -z));
        }
      }
    }
  }
  return rays;
}
