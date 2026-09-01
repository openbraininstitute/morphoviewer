import { AmbientOcclusionComputation } from "./ambient-occlusion";

import type { ArrayNumber3 } from "@tolokoban/tgd";

const RADIUS = 10;

type Position = [number, number, number];

/** A dense cluster around the origin, and one soma far outside every radius. */
const CLUSTER_AND_OUTLIER: Position[] = [
  [0, 0, 0],
  [2, 0, 0],
  [0, 3, 0],
  [0, 0, 4],
  [-2, -2, 0],
  [1000, 1000, 1000],
];

function makePoints(positions: Position[]): Float32Array {
  const points = new Float32Array(4 * positions.length);
  positions.forEach(([x, y, z], soma) => {
    points[soma * 4] = x;
    points[soma * 4 + 1] = y;
    points[soma * 4 + 2] = z;
    points[soma * 4 + 3] = 1;
  });
  return points;
}

function bboxOf(positions: Position[]): { min: ArrayNumber3; max: ArrayNumber3 } {
  const min: ArrayNumber3 = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const max: ArrayNumber3 = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  for (const position of positions) {
    for (const axis of [0, 1, 2] as const) {
      min[axis] = Math.min(min[axis], position[axis]);
      max[axis] = Math.max(max[axis], position[axis]);
    }
  }
  return { min, max };
}

/** Flat-initialized `[u, v]` pairs, the shape the painter hands over. */
function flatUVs(count: number): Float32Array {
  return new Float32Array(2 * count).fill(0.5);
}

/** Run a computation to the end in slices of `chunk` somas. */
function computeInChunks(positions: Position[], chunk: number): Float32Array {
  const computation = new AmbientOcclusionComputation(
    bboxOf(positions),
    RADIUS,
    makePoints(positions)
  );
  while (!computation.advance(chunk)) {
    // keep slicing
  }
  const uvs = flatUVs(positions.length);
  computation.writeInto(uvs);
  return uvs;
}

describe("AmbientOcclusionComputation", () => {
  it("computes the same occlusion one soma at a time as in one go", () => {
    expect(computeInChunks(CLUSTER_AND_OUTLIER, 1)).toEqual(
      computeInChunks(CLUSTER_AND_OUTLIER, CLUSTER_AND_OUTLIER.length)
    );
  });

  it("reports done only when every soma has been counted", () => {
    const computation = new AmbientOcclusionComputation(
      bboxOf(CLUSTER_AND_OUTLIER),
      RADIUS,
      makePoints(CLUSTER_AND_OUTLIER)
    );

    expect(computation.done).toBe(false);
    expect(computation.advance(CLUSTER_AND_OUTLIER.length - 1)).toBe(false);
    expect(computation.advance(1)).toBe(true);
    expect(computation.done).toBe(true);
  });

  it("normalizes to the most buried soma, and never touches u", () => {
    const uvs = computeInChunks(CLUSTER_AND_OUTLIER, 2);

    const v = CLUSTER_AND_OUTLIER.map((_, soma) => uvs[soma * 2 + 1]);
    // the most occluded soma of the cloud sets the scale
    expect(Math.max(...v)).toBe(1);
    // the outlier has no neighbour within the radius at all
    expect(v[5]).toBe(0);
    for (const value of v) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    // u — the palette column — belongs to the recolour path and stays put
    for (let soma = 0; soma < CLUSTER_AND_OUTLIER.length; soma++) {
      expect(uvs[soma * 2]).toBe(0.5);
    }
  });

  it("keeps the flat shading when no soma has a neighbour in range", () => {
    // two somas too far apart to occlude each other: every total is zero, and
    // normalizing by the largest would divide by it
    const sparse: Position[] = [
      [0, 0, 0],
      [500, 0, 0],
    ];

    expect(computeInChunks(sparse, 10)).toEqual(flatUVs(sparse.length));
  });

  it("is complete before it starts on an empty cloud", () => {
    const computation = new AmbientOcclusionComputation(
      bboxOf([]),
      RADIUS,
      makePoints([])
    );

    expect(computation.done).toBe(true);
    expect(computation.advance(10)).toBe(true);
    expect(() => computation.writeInto(new Float32Array(0))).not.toThrow();
  });
});
