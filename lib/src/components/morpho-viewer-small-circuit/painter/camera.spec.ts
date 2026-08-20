import { clampZoom, ZOOM_MAX, ZOOM_MIN } from "./camera";

// `@tolokoban/tgd` is published as ESM and jest does not transform node_modules.
// `clampZoom` uses nothing from it.
jest.mock("@tolokoban/tgd", () => ({}));

describe("clampZoom", () => {
  it("keeps a zoom that is already in range", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(ZOOM_MIN)).toBe(ZOOM_MIN);
    expect(clampZoom(ZOOM_MAX)).toBe(ZOOM_MAX);
  });

  it("pulls a zoom back to the range the controller enforces", () => {
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(-5)).toBe(ZOOM_MIN);
    expect(clampZoom(1000)).toBe(ZOOM_MAX);
  });

  it("falls back to the minimum for a value that is not a number", () => {
    // Zooming to NaN blanks the canvas.
    expect(clampZoom(Number.NaN)).toBe(ZOOM_MIN);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(ZOOM_MIN);
  });
});
