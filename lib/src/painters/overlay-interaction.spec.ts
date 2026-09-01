import { TgdEventPriority, TgdVec3 } from "@tolokoban/tgd";

import { OverlayInteractionController } from "./overlay-interaction";

import type { TgdContext, TgdInputPointerEventMove, TgdInputPointerEventTap } from "@tolokoban/tgd";
import type { MorphoViewerWorldOverlay } from "../components/types";

// `@tolokoban/tgd` is published as ESM and jest does not transform node_modules.
// Only what this controller reaches for is stood in for: a vector, and the
// priority-ordered event the pointer dispatches through — the ordering and the
// stop-on-truthy are the whole of what is under test here.
jest.mock("@tolokoban/tgd", () => ({
  TgdVec3: class {
    x = 0;
    y = 0;
    z = 0;
    constructor(a?: number | { x: number; y: number; z: number }, b?: number, c?: number) {
      if (typeof a === "number") {
        this.x = a;
        this.y = b ?? 0;
        this.z = c ?? 0;
      } else if (a) {
        this.x = a.x;
        this.y = a.y;
        this.z = a.z;
      }
    }
    clone() {
      return new (this.constructor as new (v: unknown) => this)(this);
    }
    dot(v: { x: number; y: number; z: number }) {
      return this.x * v.x + this.y * v.y + this.z * v.z;
    }
    subtract(v: { x: number; y: number; z: number }) {
      this.x -= v.x;
      this.y -= v.y;
      this.z -= v.z;
      return this;
    }
    addWithScale(v: { x: number; y: number; z: number }, scale: number) {
      this.x += v.x * scale;
      this.y += v.y * scale;
      this.z += v.z * scale;
      return this;
    }
  },
  TgdEventPriority: class {
    private listeners: Array<[(value: unknown) => unknown, number]> = [];
    addListener(listener: (value: unknown) => unknown, priority = 0) {
      this.removeListener(listener);
      this.listeners.push([listener, priority]);
      this.listeners.sort((a, b) => b[1] - a[1]);
    }
    removeListener(listener: (value: unknown) => unknown) {
      const index = this.listeners.findIndex((item) => item[0] === listener);
      if (index >= 0) this.listeners.splice(index, 1);
    }
    dispatch(value: unknown) {
      for (const [listener] of this.listeners) {
        const stop = listener(value);
        if (stop) return stop;
      }
    }
  },
}));

const WIDTH = 800;
const HEIGHT = 600;

/** The one overlay in the scene, projected to the middle of the canvas below. */
const OVERLAY: MorphoViewerWorldOverlay = {
  id: "electrode",
  color: "#fff",
  coordinates: new Float32Array([0, 0, 0]),
};

function press(x: number, y: number): TgdInputPointerEventMove {
  const finger = { x, y, t: 0, fingersCount: 1 };
  return {
    current: finger,
    previous: finger,
    start: finger,
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
  } as unknown as TgdInputPointerEventMove;
}

function tap(x: number, y: number): TgdInputPointerEventTap {
  return { x, y, t: 0.1, start: { x, y, t: 0 }, fingersCount: 1 } as TgdInputPointerEventTap;
}

function setup() {
  const pointer = {
    eventHover: new TgdEventPriority(),
    eventMoveStart: new TgdEventPriority(),
    eventMove: new TgdEventPriority(),
    eventMoveEnd: new TgdEventPriority(),
    eventTap: new TgdEventPriority(),
  };
  const context = {
    canvas: document.createElement("canvas"),
    inputs: { pointer },
    camera: {
      screenWidth: WIDTH,
      screenHeight: HEIGHT,
      // The overlay sits dead centre, whatever the press was aimed at.
      apply: () => ({ x: 0, y: 0, z: 0, w: 1 }),
      castRay: () => ({ origin: new TgdVec3(0, 0, 10), direction: new TgdVec3(0, 0, -1) }),
      transfo: { axisZ: new TgdVec3(0, 0, 1) },
    },
  } as unknown as TgdContext;

  const controller = new OverlayInteractionController({
    context,
    getOverlays: () => [OVERLAY],
    setOverlays: () => {},
    syncOverlayPositions: () => {},
    getHitRadiusPixels: () => 10,
    getOrbit: () => null,
    setHighlightedId: () => {},
  });
  controller.attach();

  // What a viewer registers to pick a cell: no priority, so the controller's runs first.
  const scene = jest.fn();
  pointer.eventTap.addListener(scene);
  return { controller, pointer, scene };
}

describe("OverlayInteractionController taps", () => {
  it("keeps a click on an overlay from reaching the scene behind it", () => {
    const { pointer, scene } = setup();

    pointer.eventMoveStart.dispatch(press(0, 0));
    pointer.eventTap.dispatch(tap(0, 0));

    expect(scene).not.toHaveBeenCalled();
  });

  it("lets a click on the background through", () => {
    const { pointer, scene } = setup();

    // Far from the overlay at the centre: the press picked nothing.
    pointer.eventMoveStart.dispatch(press(0.9, 0.9));
    pointer.eventTap.dispatch(tap(0.9, 0.9));

    expect(scene).toHaveBeenCalledTimes(1);
  });

  it("answers for the press that just ended, not the one before it", () => {
    const { pointer, scene } = setup();

    pointer.eventMoveStart.dispatch(press(0, 0));
    pointer.eventTap.dispatch(tap(0, 0));
    pointer.eventMoveStart.dispatch(press(0.9, 0.9));
    pointer.eventTap.dispatch(tap(0.9, 0.9));

    expect(scene).toHaveBeenCalledTimes(1);
  });

  it("stops vetoing once it is detached", () => {
    const { controller, pointer, scene } = setup();

    pointer.eventMoveStart.dispatch(press(0, 0));
    controller.detach();
    pointer.eventTap.dispatch(tap(0, 0));

    expect(scene).toHaveBeenCalledTimes(1);
  });
});
