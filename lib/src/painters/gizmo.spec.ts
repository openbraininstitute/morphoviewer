import { PainterGizmo } from "./gizmo";

import type { TgdContext } from "@tolokoban/tgd";

/** The gizmos built, so a test can hand one its overlay as the package would. */
const mockGizmos: { overlay: object | null; margins: number[] }[] = [];

// `@tolokoban/tgd` is published as ESM and jest does not transform node_modules.
// Only what the painter reaches for is stood in for: a group to hold the gizmo,
// and a gizmo whose overlay arrives when the test says so.
jest.mock("@tolokoban/tgd", () => ({
  TgdPainterGroup: class {
    add() {}
    removeAll() {}
  },
  TgdPainterState: class {},
  TgdPainterGizmo: class {
    overlay: object | null = null;
    margins: number[] = [];
    constructor() {
      mockGizmos.push(this);
    }
    set margin(margin: number) {
      this.margins.push(margin);
    }
  },
}));

/** Enough of tgd's event: listeners in a set, which one may leave while it is called. */
class FakeEvent {
  readonly listeners = new Set<() => void>();
  addListener(listener: () => void) {
    this.listeners.add(listener);
  }
  removeListener(listener: () => void) {
    this.listeners.delete(listener);
  }
  dispatch() {
    for (const listener of this.listeners) listener();
  }
}

/**
 * A context that paints its frames the way tgd does: the queue of actions run
 * live, so one queued while it runs is run in the same frame, then the frame's
 * start announced. Past a bound the queue is taken to be spinning, which is
 * what the frame did when the gizmo queued its retries there.
 */
function fakeContext() {
  const queue: (() => void)[] = [];
  const eventPaintEnter = new FakeEvent();
  const context = {
    eventPaintEnter,
    execBeforeNextPaint: (...actions: (() => void)[]) => queue.push(...actions),
    paint() {
      let ran = 0;
      for (const action of queue) {
        if (++ran > 1000) throw new Error("the frame never ends");
        action();
      }
      queue.splice(0);
      eventPaintEnter.dispatch();
    },
  };
  return context;
}

describe("PainterGizmo margin", () => {
  beforeEach(() => {
    mockGizmos.splice(0);
  });

  function build() {
    const context = fakeContext();
    const painter = new PainterGizmo();
    painter.context = context as unknown as TgdContext;
    const [gizmo] = mockGizmos;
    if (!gizmo) throw new Error("no gizmo was built");
    return { context, painter, gizmo };
  }

  it("lets a frame painted before the overlay exists finish", () => {
    const { context, gizmo } = build();

    expect(() => context.paint()).not.toThrow();
    expect(gizmo.margins).toEqual([]);
  });

  it("insets the gizmo on the first frame its overlay is there, and only then", () => {
    const { context, gizmo } = build();
    context.paint();

    gizmo.overlay = {};
    context.paint();
    context.paint();

    expect(gizmo.margins).toEqual([8]);
    expect(context.eventPaintEnter.listeners.size).toBe(0);
  });

  it("sets it at once where the overlay is already there", () => {
    const { context, painter } = build();
    const [first] = mockGizmos;
    first.overlay = {};
    context.paint();

    painter.options = { alignX: 1, alignY: -1, size: 128, margin: 20 };

    expect(first.margins).toEqual([8, 20]);
  });

  it("drops the wait of a gizmo that has been replaced", () => {
    const { context, painter, gizmo } = build();

    painter.options = false;
    painter.options = true;
    gizmo.overlay = {};
    context.paint();

    expect(gizmo.margins).toEqual([]);
    expect(context.eventPaintEnter.listeners.size).toBe(1);
  });
});
