import type { ArrayNumber3, ArrayNumber4 } from "@tolokoban/tgd";

export class Proximity {
  private readonly stepsX: number;
  private readonly inverseStepsX: number;
  private readonly stepsY: number;
  private readonly inverseStepsY: number;
  private readonly stepsZ: number;
  private readonly inverseStepsZ: number;
  private readonly stepsYZ: number;
  private readonly grid: Int32Array;
  private readonly nextPoint: Int32Array;

  constructor(
    private readonly points: Float32Array,
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
    this.stepsYZ = this.stepsY * this.stepsZ;
    const count = this.stepsX * this.stepsY * this.stepsZ;
    this.grid = new Int32Array(count).fill(-1);
    this.nextPoint = new Int32Array(count).fill(-1);

    for (let k = 0; k < points.length; k += 4) {
      const x = points[k];
      const y = points[k + 1];
      const z = points[k + 2];
      const index = this.index(x, y, z);
      this.nextPoint[index] = this.grid[index];
      this.grid[index] = k;
    }
  }

  /**
   * @param pointIndex Index of the point whom neighbors your want to loop on.
   * @param action You can return `false` to stop the loop.
   */
  forEachNeighbor(
    pointIndex: number,
    action: (x: number, y: number, z: number, radius: number, distSquare: number) => unknown
  ) {
    const { points, radius, grid, nextPoint } = this;
    const x = points[pointIndex];
    const y = points[pointIndex + 1];
    const z = points[pointIndex + 2];
    const indexX = Math.floor((x - this.bbox.min[0]) * this.inverseStepsX);
    const indexY = Math.floor((y - this.bbox.min[1]) * this.inverseStepsY);
    const indexZ = Math.floor((z - this.bbox.min[2]) * this.inverseStepsZ);
    const startX = Math.max(0, indexX - 1);
    const endX = Math.min(this.stepsX - 1, indexX + 1);
    const startY = Math.max(0, indexY - 1);
    const endY = Math.min(this.stepsY - 1, indexY + 1);
    const startZ = Math.max(0, indexZ - 1);
    const endZ = Math.min(this.stepsZ - 1, indexZ + 1);
    const radiusSquare = radius * radius;
    for (let nX = startX; nX <= endX; nX++) {
      for (let nY = startY; nY <= endY; nY++) {
        for (let nZ = startZ; nZ <= endZ; nZ++) {
          const cellIndex = nX * this.stepsYZ + nY * this.stepsZ + nZ;
          let neighborIndex = grid[cellIndex];
          while (neighborIndex > -1) {
            const xx = points[neighborIndex] - x;
            const yy = points[neighborIndex + 1] - y;
            const zz = points[neighborIndex + 2] - z;
            const distSquare = xx * xx + yy * yy + zz * zz;
            if (distSquare < radiusSquare && distSquare > 0) {
              const rr = points[neighborIndex + 3];
              if (false === action(xx, yy, zz, rr, distSquare)) return;
            }
            neighborIndex = nextPoint[neighborIndex];
          }
        }
      }
    }
  }

  private index(x: number, y: number, z: number) {
    const indexX = Math.floor((x - this.bbox.min[0]) * this.inverseStepsX);
    const indexY = Math.floor((y - this.bbox.min[1]) * this.inverseStepsY);
    const indexZ = Math.floor((z - this.bbox.min[2]) * this.inverseStepsZ);
    return indexX * this.stepsYZ + indexY * this.stepsZ + indexZ;
  }
}
