import type { ArrayNumber3, ArrayNumber4 } from "@tolokoban/tgd";

export class Proximity {
  private readonly stepsX: number;
  private readonly inverseStepsX: number;
  private readonly stepsY: number;
  private readonly inverseStepsY: number;
  private readonly stepsZ: number;
  private readonly inverseStepsZ: number;
  private readonly grid: Readonly<ArrayNumber3>[][][][] = [];

  constructor(
    private readonly bbox: { min: ArrayNumber3; max: ArrayNumber3 },
    private readonly radius: number
  ) {
    const inverseRadius = 1 / radius;
    const sizeX = bbox.max[0] - bbox.min[0];
    this.stepsX = Math.ceil(sizeX * inverseRadius);
    this.inverseStepsX = this.stepsX / sizeX;
    const sizeY = bbox.max[1] - bbox.min[1];
    this.stepsY = Math.ceil(sizeY * inverseRadius);
    this.inverseStepsY = this.stepsY / sizeY;
    const sizeZ = bbox.max[2] - bbox.min[2];
    this.stepsZ = Math.ceil(sizeZ * inverseRadius);
    this.inverseStepsZ = this.stepsZ / sizeZ;
  }

  getNeighbours(x: number, y: number, z: number): Readonly<ArrayNumber4>[] {
    const idxX = this.indexX(x);
    if (idxX < 0 || idxX >= this.stepsX) return [];

    const gridYZ = this.grid[idxX];
    if (!gridYZ) return [];

    const idxY = this.indexY(y);
    if (idxY < 0 || idxY >= this.stepsY) return [];

    const gridZ = gridYZ[idxY];
    if (!gridZ) return [];

    const idxZ = this.indexZ(z);
    if (idxZ < 0 || idxZ >= this.stepsZ) return [];

    const points = gridZ[idxZ];
    if (!points) return [];

    const result: Readonly<ArrayNumber4>[] = [];
    const radius2 = this.radius ** 2;
    const inverseRadius2 = 1 / radius2;
    for (const [xx, yy, zz] of points) {
      const dx = xx - x;
      const dy = yy - y;
      const dz = zz - z;
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist === 0 || dist >= radius2) continue;

      result.push([xx, yy, zz, 1 - inverseRadius2 * dist]);
    }
    return result;
  }

  addPoint(point: Readonly<ArrayNumber3>) {
    const [x, y, z] = point;
    const idxX = this.indexX(x);
    const idxY = this.indexY(y);
    const idxZ = this.indexZ(z);
    const shifts = [-1, 0, +1];
    for (const shiftX of shifts) {
      const iX = idxX + shiftX;
      if (iX < 0 || iX >= this.stepsX) continue;

      const gridYZ = getOrAdd(this.grid, iX);
      for (const shiftY of shifts) {
        const iY = idxY + shiftY;
        if (iY < 0 || iY >= this.stepsY) continue;

        const gridZ = getOrAdd(gridYZ, iY);
        for (const shiftZ of shifts) {
          const iZ = idxZ + shiftZ;
          if (iZ < 0 || iZ >= this.stepsZ) continue;

          const voxel = getOrAdd(gridZ, iZ);
          voxel.push(point);
        }
      }
    }
  }

  private readonly indexX = (x: number) => Math.floor((x - this.bbox.min[0]) * this.inverseStepsX);
  private readonly indexY = (y: number) => Math.floor((y - this.bbox.min[1]) * this.inverseStepsY);
  private readonly indexZ = (z: number) => Math.floor((z - this.bbox.min[2]) * this.inverseStepsZ);
}

function getOrAdd<T>(array: T[][], index: number): T[] {
  const elem = array[index];
  if (elem) return elem;

  const newItem: T[] = [];
  array[index] = newItem;
  return newItem;
}
