import { isStillPointer } from "./still-pointer";

/** On a 800x600 canvas, one pixel is 2/800 wide and 2/600 tall. */
const WIDTH = 800;
const HEIGHT = 600;

function tap(dxInPixels: number, dyInPixels: number) {
  return {
    x: (dxInPixels * 2) / WIDTH,
    y: (dyInPixels * 2) / HEIGHT,
    start: { x: 0, y: 0, t: 0, fingersCount: 1 },
  };
}

describe("isStillPointer", () => {
  it("accepts a pointer that did not move", () => {
    expect(isStillPointer(tap(0, 0), WIDTH, HEIGHT)).toBe(true);
  });

  it("accepts the small drift of a real click", () => {
    expect(isStillPointer(tap(3, 3), WIDTH, HEIGHT)).toBe(true);
  });

  it("rejects a short orbit, which is emitted as a tap too", () => {
    expect(isStillPointer(tap(40, 25), WIDTH, HEIGHT)).toBe(false);
  });

  it("measures in pixels, not clip units, on both axes", () => {
    expect(isStillPointer(tap(0, 4), WIDTH, HEIGHT)).toBe(true);
    expect(isStillPointer(tap(0, 8), WIDTH, HEIGHT)).toBe(false);
  });

  it("lets the pick through when the canvas size is unknown", () => {
    expect(isStillPointer(tap(999, 999), 0, 0)).toBe(true);
  });
});
