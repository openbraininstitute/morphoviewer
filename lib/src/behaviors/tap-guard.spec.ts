import { TapGuard } from "./tap-guard";

/** On a 800x600 canvas, one pixel is 2/800 wide and 2/600 tall. */
const WIDTH = 800;
const HEIGHT = 600;

const clipX = (pixels: number) => (pixels * 2) / WIDTH;
const clipY = (pixels: number) => (pixels * 2) / HEIGHT;

/** A press that ended `dxInPixels`,`dyInPixels` from where it started. */
function tap(dxInPixels: number, dyInPixels: number, seconds = 0.1) {
  return {
    x: clipX(dxInPixels),
    y: clipY(dyInPixels),
    t: seconds,
    start: { x: 0, y: 0, t: 0, fingersCount: 1 },
    fingersCount: 1,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    buttons: 1,
    buttonLeft: true,
    buttonRight: false,
    buttonMiddle: false,
    buttonBack: false,
    buttonForward: false,
  };
}

function guard() {
  const tapGuard = new TapGuard();
  tapGuard.begin(0, 0, WIDTH, HEIGHT);
  return tapGuard;
}

describe("TapGuard", () => {
  it("accepts a pointer that did not move", () => {
    expect(guard().isClick(tap(0, 0))).toBe(true);
  });

  it("accepts the small drift of a real click", () => {
    expect(guard().isClick(tap(3, 3))).toBe(true);
  });

  it("rejects a press that ended away from where it started", () => {
    expect(guard().isClick(tap(40, 25))).toBe(false);
  });

  it("measures in pixels, not clip units, on both axes", () => {
    expect(guard().isClick(tap(0, 4))).toBe(true);
    expect(guard().isClick(tap(0, 8))).toBe(false);
  });

  // What the endpoint test alone could not see, and what kept selecting a
  // population at the end of a rotation.
  it("rejects an orbit that wandered and came back", () => {
    const tapGuard = guard();
    tapGuard.move(clipX(60), clipY(40));
    tapGuard.move(clipX(2), clipY(1));

    expect(tapGuard.isClick(tap(2, 1))).toBe(false);
  });

  it("keeps accepting a press that only ever drifted", () => {
    const tapGuard = guard();
    tapGuard.move(clipX(2), clipY(2));
    tapGuard.move(clipX(3), clipY(1));

    expect(tapGuard.isClick(tap(3, 1))).toBe(true);
  });

  // A slow rotation at high zoom turns the camera without leaving the slop
  // circle, so distance alone lets it through.
  it("rejects a press held far longer than a click", () => {
    expect(guard().isClick(tap(1, 1, 0.9))).toBe(false);
  });

  it("starts each press over", () => {
    const tapGuard = guard();
    tapGuard.move(clipX(60), clipY(40));
    tapGuard.begin(0, 0, WIDTH, HEIGHT);

    expect(tapGuard.isClick(tap(0, 0))).toBe(true);
  });

  it("lets the pick through when the canvas size is unknown", () => {
    const tapGuard = new TapGuard();
    tapGuard.begin(0, 0, 0, 0);
    tapGuard.move(clipX(999), clipY(999));

    expect(tapGuard.isClick(tap(999, 999))).toBe(true);
  });
});
