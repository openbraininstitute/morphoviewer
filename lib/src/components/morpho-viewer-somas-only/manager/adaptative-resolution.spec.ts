import { AdpatativeResolution } from "./adaptative-resolution";

import type { TgdContext } from "@tolokoban/tgd";

// `@tolokoban/tgd` is published as ESM and jest does not transform node_modules.
// Only `TgdPainterLogic` is used as a value here, and all it does is forward the
// frame to its callback.
jest.mock("@tolokoban/tgd", () => ({
  TgdPainterLogic: class {
    constructor(private readonly logicFunction: (time: number, delta: number) => void) {}
    paint(time: number, delta: number) {
      this.logicFunction(time, delta);
    }
  },
}));

/**
 * Minimal stand-in for the bits of `TgdContext` the controller touches, plus a
 * `frame()` helper that replays the engine's paint loop: the controller is
 * registered first in the paint order and receives the duration of the previous
 * frame in seconds.
 */
class FakeContext {
  resolution = 1;
  paintCount = 0;
  private logic: { paint(time: number, delta: number): void } | null = null;
  private time = 0;

  addFirst(painter: { paint(time: number, delta: number): void }) {
    this.logic = painter;
  }
  remove() {
    this.logic = null;
  }
  paint() {
    this.paintCount++;
  }

  /** replay `count` frames, each taking `frameTime` seconds. */
  frame(frameTime: number, count = 1) {
    for (let i = 0; i < count; i++) {
      this.time += frameTime;
      this.logic?.paint(this.time, frameTime);
    }
  }

  asTgdContext(): TgdContext {
    return this as unknown as TgdContext;
  }
}

const FAST = 1 / 120; // a comfortable frame on an office Mac
const SLOW = 1 / 10; // a genuinely overloaded machine
const WINDOW = 8; // frames the controller needs before it reacts

function setup() {
  const context = new FakeContext();
  const adaptative = new AdpatativeResolution();
  adaptative.context = context.asTgdContext();
  return { context, adaptative };
}

/** run a full interaction: lowRes → `count` frames → highRes. */
function interact(
  context: FakeContext,
  adaptative: AdpatativeResolution,
  frameTime: number,
  count: number
) {
  adaptative.lowRes();
  // +1 for the grace frame that opens every measurement window
  context.frame(frameTime, count + 1);
  adaptative.highRes();
}

describe("AdpatativeResolution", () => {
  it("starts at full resolution", () => {
    const { context } = setup();

    expect(context.resolution).toBe(1);
  });

  describe("on a machine that keeps up", () => {
    it("never lowers the resolution, however long the interaction", () => {
      const { context, adaptative } = setup();

      interact(context, adaptative, FAST, WINDOW * 20);

      expect(context.resolution).toBe(1);
    });

    // The bug behind both cases in the ticket: `highRes()` used to return
    // early before clearing its state whenever the resolution was still 1 —
    // i.e. always, on a machine fast enough never to be downscaled. The
    // controller then stayed armed forever and judged idle repaints, whose
    // spacing is the gap between two unrelated events, as if they were frames.
    it("stops measuring once the interaction ends", () => {
      const { context, adaptative } = setup();

      interact(context, adaptative, FAST, WINDOW * 2);
      // fullscreen transition / colour-by rebuild: a burst of sparse repaints,
      // hundreds of milliseconds apart, with nobody interacting.
      context.frame(0.4, WINDOW * 4);

      expect(context.resolution).toBe(1);
    });

    it("ignores a one-off stall in the middle of an interaction", () => {
      const { context, adaptative } = setup();

      adaptative.lowRes();
      context.frame(FAST, 4);
      context.frame(0.8, 1); // e.g. a garbage collection pause
      context.frame(FAST, WINDOW * 2);
      adaptative.highRes();

      expect(context.resolution).toBe(1);
    });
  });

  describe("on a machine that cannot keep up", () => {
    it("lowers the resolution", () => {
      const { context, adaptative } = setup();

      adaptative.lowRes();
      context.frame(SLOW, WINDOW + 1);

      expect(context.resolution).toBeLessThan(1);
    });

    it("lowers it gradually rather than collapsing in one step", () => {
      const { context, adaptative } = setup();

      adaptative.lowRes();
      context.frame(SLOW, WINDOW + 1);

      // a single adjustment may at most halve the pixel count
      expect(context.resolution).toBeGreaterThanOrEqual(Math.sqrt(0.5));
    });

    it("never goes below the floor that keeps the canvas visible", () => {
      const { context, adaptative } = setup();

      adaptative.lowRes();
      context.frame(0.5, WINDOW * 40); // 2 frames per second, for a long while

      expect(context.resolution).toBe(0.2);
    });

    it("ignores paints too far apart to be frames at all", () => {
      const { context, adaptative } = setup();

      adaptative.lowRes();
      context.frame(2, WINDOW * 3);

      expect(context.resolution).toBe(1);
    });

    // ...so a slow machine does not re-discover its own slowness, at full
    // resolution, at the start of every single gesture.
    it("re-applies what it learned on the next interaction", () => {
      const { context, adaptative } = setup();

      interact(context, adaptative, SLOW, WINDOW);
      adaptative.lowRes();

      expect(context.resolution).toBeLessThan(1);
    });
  });

  describe("recovery", () => {
    // Nothing used to raise the resolution again: one bad measurement degraded
    // every later interaction until the viewer was rebuilt.
    it("gives the resolution back once the frames are fast again", () => {
      const { context, adaptative } = setup();

      interact(context, adaptative, SLOW, WINDOW);
      adaptative.lowRes();
      expect(context.resolution).toBeLessThan(1);
      adaptative.highRes();

      interact(context, adaptative, FAST, WINDOW * 12);

      adaptative.lowRes();
      expect(context.resolution).toBe(1);
    });

    it("restores full resolution as soon as the interaction ends", () => {
      const { context, adaptative } = setup();

      adaptative.lowRes();
      context.frame(SLOW, WINDOW + 1);
      expect(context.resolution).toBeLessThan(1);

      adaptative.highRes();
      expect(context.resolution).toBe(1);
    });
  });

  describe("invalidate()", () => {
    it("drops the frames measured so far", () => {
      const { context, adaptative } = setup();

      adaptative.lowRes();
      context.frame(SLOW, WINDOW - 1); // one frame short of a decision
      adaptative.invalidate(); // a resize, or a point cloud rebuild
      context.frame(SLOW, WINDOW - 1);

      expect(context.resolution).toBe(1);
    });
  });

  describe("while an image capture owns the resolution", () => {
    it("does not downscale the captured frame", () => {
      const { context, adaptative } = setup();

      adaptative.suspend();
      context.resolution = 3; // device pixels, set by `snapshot()`
      adaptative.lowRes();
      context.frame(SLOW, WINDOW * 2);

      expect(context.resolution).toBe(3);
    });

    it("restores the live view when the capture is over", () => {
      const { context, adaptative } = setup();

      adaptative.suspend();
      context.resolution = 3;
      adaptative.resume();

      expect(context.resolution).toBe(1);
    });
  });

  describe("reset()", () => {
    it("returns to full resolution", () => {
      const { context, adaptative } = setup();

      adaptative.lowRes();
      context.frame(SLOW, WINDOW + 1);
      adaptative.reset();

      expect(context.resolution).toBe(1);
    });

    it("forgets what it learned", () => {
      const { context, adaptative } = setup();

      interact(context, adaptative, SLOW, WINDOW);
      adaptative.reset();
      adaptative.lowRes();

      expect(context.resolution).toBe(1);
    });
  });

  describe("detaching the context", () => {
    it("stops painting into it", () => {
      const { context, adaptative } = setup();

      adaptative.context = null;
      const paintsBefore = context.paintCount;
      adaptative.lowRes();
      adaptative.highRes();

      expect(context.paintCount).toBe(paintsBefore);
    });
  });
});
