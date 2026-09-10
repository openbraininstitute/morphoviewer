import { depthRangeCovering, extentAlong, widenDepthRange } from "./framing";

import type { ArrayNumber3, TgdBoundingBox, TgdCamera, TgdVec3 } from "@tolokoban/tgd";

// `@tolokoban/tgd` is published as ESM and jest does not transform
// node_modules. The framing rules reach for two things only: the distance
// between two points, and the class a camera is checked against.
jest.mock("@tolokoban/tgd", () => ({
  TgdVec3: {
    distance: (from: ArrayNumber3, to: ArrayNumber3) =>
      Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]),
  },
  TgdCameraOrthographic: class {
    near: number;
    far: number;
    constructor(near: number, far: number) {
      this.near = near;
      this.far = far;
    }
  },
}));

const { TgdCameraOrthographic } = jest.requireMock("@tolokoban/tgd");

/** A box of `size`, centred on `center`. Only these two are ever read. */
function boxOf(size: ArrayNumber3, center: ArrayNumber3 = [0, 0, 0]) {
  return { size, center } as unknown as TgdBoundingBox;
}

function orthographic(near: number, far: number): TgdCamera {
  return new TgdCameraOrthographic(near, far) as TgdCamera;
}

/** Anything that is not an orthographic camera, which is what the near rule turns on. */
function perspective(near: number, far: number): TgdCamera {
  return { near, far } as TgdCamera;
}

function axis(x: number, y: number, z: number) {
  return { x, y, z } as TgdVec3;
}

const ORIGIN = [0, 0, 0] as unknown as TgdVec3;

describe("depthRangeCovering", () => {
  it("wraps the slab around the scene, both ways from the eye", () => {
    // Half the diagonal of a 2-cube is √3, so its far corner sits that much
    // beyond the centre the camera is standing 10 away from, and its near one
    // that much short of it.
    const range = depthRangeCovering(boxOf([2, 2, 2]), ORIGIN, 10);

    expect(range.near).toBeCloseTo(10 - Math.sqrt(3));
    expect(range.far).toBeCloseTo(10 + Math.sqrt(3));
  });

  it("counts the walk from where the camera is aimed to the scene's centre", () => {
    // Framing one end of a circuit leaves the other end further off than the
    // camera's own distance, which is the whole reason for the far plane.
    const range = depthRangeCovering(boxOf([2, 2, 2]), [100, 0, 0] as unknown as TgdVec3, 10);

    expect(range.far).toBeCloseTo(110 + Math.sqrt(3));
  });

  it("reaches behind the eye when the scene does", () => {
    // A camera framing a cluster at the front of a wide cloud stands inside
    // that cloud, and what is in front of it is at a negative depth.
    const range = depthRangeCovering(boxOf([1000, 1000, 1000]), ORIGIN, 10);

    expect(range.near).toBeLessThan(0);
  });
});

describe("widenDepthRange", () => {
  it("keeps the slab it has when that one is already wider", () => {
    const camera = orthographic(-50, 5000);

    widenDepthRange(camera, { near: 1, far: 100 });

    expect(camera.near).toBe(-50);
    expect(camera.far).toBe(5000);
  });

  it("opens both ends when the scene needs them", () => {
    const camera = orthographic(1, 100);

    widenDepthRange(camera, { near: -20, far: 5000 });

    expect(camera.near).toBe(-20);
    expect(camera.far).toBe(5000);
  });

  it("leaves a perspective near plane alone, since a frustum starts at the eye", () => {
    const camera = perspective(0.1, 100);

    widenDepthRange(camera, { near: -20, far: 5000 });

    expect(camera.near).toBe(0.1);
    expect(camera.far).toBe(5000);
  });
});

describe("extentAlong", () => {
  it("reads off the box sides while the camera is on the world axes", () => {
    expect(extentAlong([200, 300, 2000], axis(1, 0, 0))).toBeCloseTo(200);
    expect(extentAlong([200, 300, 2000], axis(0, 1, 0))).toBeCloseTo(300);
  });

  it("gives the depth as the width once the camera has turned a quarter turn", () => {
    // A circuit two thousand deep and two hundred wide is two thousand wide
    // seen from the side, and framing it as if it were still two hundred cuts
    // it off on both sides.
    expect(extentAlong([200, 300, 2000], axis(0, 0, 1))).toBeCloseTo(2000);
  });

  it("takes the corner into account on a diagonal", () => {
    expect(extentAlong([2, 0, 2], axis(Math.SQRT1_2, 0, Math.SQRT1_2))).toBeCloseTo(2 * Math.SQRT2);
  });
});
