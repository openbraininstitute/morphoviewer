import { Proximity } from "./proximity";

import type { ArrayNumber3 } from "@tolokoban/tgd";

/**
 * How occluded every soma in a cloud is, as work that can be picked up and
 * put down.
 *
 * The occlusion itself is a proximity sum: how much of the sphere of `radius`
 * around a soma its neighbours take up, normalized so the most buried soma in
 * the cloud reads 1 and an isolated one reads 0. What used to be one function
 * call is a class because at region scale the counting is about a second of
 * arithmetic, and the caller wants to spread it over idle slices rather than
 * spend it in one piece on the first paint: build one, call {@link advance}
 * until it says it is done, then {@link writeInto} the cloud's `[u, v]` array.
 *
 * The totals accumulate here rather than in that array, so whatever uploads
 * it mid-computation — a recolour, say — carries the flat shading the array
 * started with instead of half of an unnormalized result.
 */
export class AmbientOcclusionComputation {
  /** Raw per-soma occlusion; {@link writeInto} is what normalizes it. */
  private readonly totals: Float32Array;
  /** Largest of {@link totals}, running, so normalizing needs no extra pass. */
  private maxTotal = 0;
  /** The soma {@link advance} continues from. */
  private cursor = 0;
  /** Built on first use: it walks every soma, which is exactly the kind of
   * work creating this class must not do. */
  private proximity: Proximity | null = null;

  constructor(
    private readonly bbox: { min: ArrayNumber3; max: ArrayNumber3 },
    private readonly radius: number,
    /** `[x, y, z, radius]` per soma, the cloud's own layout. */
    private readonly points: Float32Array
  ) {
    this.totals = new Float32Array(points.length >> 2);
  }

  get done(): boolean {
    // An inside-out bounding box is a cloud with nothing in it.
    return this.cursor >= this.totals.length || this.bbox.min[0] > this.bbox.max[0];
  }

  /** Sum neighbours for up to `count` more somas. Returns {@link done}. */
  advance(count: number): boolean {
    if (this.done) return true;

    const proximity = (this.proximity ??= new Proximity(this.points, this.bbox, this.radius));
    const radiusSquare = this.radius * this.radius;
    const { totals } = this;
    const end = Math.min(totals.length, this.cursor + count);
    for (let soma = this.cursor; soma < end; soma++) {
      let total = 0;
      proximity.forEachNeighbor(
        soma * 4,
        (_x: number, _y: number, _z: number, _r: number, distSquare: number) =>
          (total += radiusSquare - distSquare)
      );
      totals[soma] = total;
      if (total > this.maxTotal) this.maxTotal = total;
    }
    this.cursor = end;
    return this.done;
  }

  /**
   * Write the normalized occlusion into the `v` of every `[u, v]` pair,
   * leaving `u` — the palette column — alone. Call it once {@link done}.
   *
   * A cloud where no soma has a neighbour in range never writes at all:
   * there is nothing to normalize by, and the flat shading the array was
   * initialized with is already the right answer.
   */
  writeInto(uvs: Float32Array): void {
    const { totals, maxTotal } = this;
    if (maxTotal <= 0) return;

    const invMax = 1 / maxTotal;
    for (let soma = 0; soma < totals.length; soma++) {
      uvs[soma * 2 + 1] = totals[soma] * invMax;
    }
  }
}
