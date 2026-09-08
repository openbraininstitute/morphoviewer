import { clampCameraFocus } from "./camera-focus";

describe("clampCameraFocus", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("keeps a range that is inside the scene", () => {
    const focus = { from: 2, count: 3 };

    expect(clampCameraFocus(focus, 5)).toBe(focus);
    expect(warn).not.toHaveBeenCalled();
  });

  it("takes no focus for what it is, rather than as something to complain about", () => {
    expect(clampCameraFocus(undefined, 5)).toBeNull();
    expect(clampCameraFocus(null, 5)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("frames the whole scene, loudly, for a range that runs past it", () => {
    // A host that swapped geometry and focus in the wrong order lands here, and
    // the cells it would otherwise frame are somebody else's.
    expect(clampCameraFocus({ from: 3, count: 4 }, 5)).toBeNull();
    expect(clampCameraFocus({ from: 5, count: 1 }, 5)).toBeNull();
    expect(clampCameraFocus({ from: -1, count: 2 }, 5)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("frames the whole scene for a range that names no cells", () => {
    expect(clampCameraFocus({ from: 0, count: 0 }, 5)).toBeNull();
    expect(clampCameraFocus({ from: 0, count: 1.5 }, 5)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
