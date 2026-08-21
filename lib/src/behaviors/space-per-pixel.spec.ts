import { watchSpacePerPixel } from "./space-per-pixel";

import type { TgdContext, TgdEvent } from "@tolokoban/tgd";

jest.mock("@tolokoban/tgd", () => ({}));

/** A context that paints on demand, standing in for the parts this behavior reads. */
function fakeContext(resolution: number, spacePerPixel: number) {
  const listeners: Array<() => void> = [];
  return {
    resolution,
    camera: { spacePerPixel },
    eventPaint: {
      addListener: (fn: () => void) => listeners.push(fn),
      removeListener: () => {},
    },
    paint: () => {
      for (const fn of listeners) fn();
    },
  };
}

function collect(resolution: number, spacePerPixel: number): number[] {
  const dispatched: number[] = [];
  const context = fakeContext(resolution, spacePerPixel);
  const event = { dispatch: (v: number) => dispatched.push(v) };
  watchSpacePerPixel(context as unknown as TgdContext, event as unknown as TgdEvent<number>);
  context.paint();
  return dispatched;
}

describe("watchSpacePerPixel", () => {
  it("reports the space a CSS pixel covers, whatever the canvas paints at", () => {
    // The camera measures in device pixels; a scalebar draws in CSS pixels.
    expect(collect(1, 0.5)).toEqual([0.5]);
    expect(collect(2, 0.25)).toEqual([0.5]);
    expect(collect(3, 0.5 / 3)).toEqual([0.5]);
  });

  it("reports only when the value changes", () => {
    const context = fakeContext(1, 0.5);
    const dispatched: number[] = [];
    const event = { dispatch: (v: number) => dispatched.push(v) };
    watchSpacePerPixel(context as unknown as TgdContext, event as unknown as TgdEvent<number>);
    context.paint();
    context.paint();
    expect(dispatched).toHaveLength(1);
  });
});
