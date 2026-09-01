import { hiddenSomaMask, PainterCellInfos } from "./painter-cell-infos";

import type { TgdContext } from "@tolokoban/tgd";
import type { MorphoViewerCellInfo } from "../types";

/** The palette canvas as it was handed to the texture, for the colour tests. */
const mockPalette: { canvas: HTMLCanvasElement | null } = { canvas: null };

// `@tolokoban/tgd` is published as ESM and jest does not transform
// node_modules. Only the classes the painter builds on are stood in for, each
// reduced to what the painter actually calls on it.
jest.mock("@tolokoban/tgd", () => ({
  TgdBoundingBox: class {
    min = [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ];
    max = [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];
    addSphere(x: number, y: number, z: number, radius: number) {
      const center = [x, y, z];
      for (const axis of [0, 1, 2]) {
        this.min[axis] = Math.min(this.min[axis], center[axis] - radius);
        this.max[axis] = Math.max(this.max[axis], center[axis] + radius);
      }
    }
  },
  TgdPainterGroup: class {
    constructor(_options: unknown) {}
    delete() {}
  },
  TgdTexture2D: class {
    loadBitmap(canvas: HTMLCanvasElement) {
      mockPalette.canvas = canvas;
      return this;
    }
    delete() {}
  },
}));

// The cloud painter owns the GPU side; here it only has to remember the
// arrays it was built around and record what `setUV` pushes.
const mockCloud: { point: Float32Array | null; uv: Float32Array | null; setUV: jest.Mock } = {
  point: null,
  uv: null,
  setUV: jest.fn(),
};
jest.mock("./painter-soma-cloud", () => ({
  PainterSomaCloud: class {
    radiusMultiplier = 1;
    constructor(_context: unknown, options: { dataPoint: Float32Array; dataUV: Float32Array }) {
      mockCloud.point = options.dataPoint;
      mockCloud.uv = options.dataUV;
    }
    setUV(dataUV: Float32Array) {
      mockCloud.setUV(dataUV.slice());
    }
    setGlow() {}
    delete() {}
  },
}));

/** A dense cluster and one soma far outside every occlusion radius. */
const CELL_INFOS: MorphoViewerCellInfo[] = [
  [0, 0, 0],
  [2, 0, 0],
  [0, 3, 0],
  [0, 0, 4],
  [-2, -2, 0],
  [10_000, 10_000, 10_000],
].map((position, index) => ({
  morphologyId: `m${index}`,
  position: position as [number, number, number],
}));

function makePainter(context: TgdContext): PainterCellInfos {
  return new PainterCellInfos(context, {
    cellInfos: CELL_INFOS,
    colors: null,
    somaRadius: 1,
  });
}

/** The same somas as {@link CELL_INFOS}, the way a flat-array host holds them. */
const POSITIONS = new Float32Array(CELL_INFOS.flatMap(({ position }) => position));

function mustPoint(): Float32Array {
  if (!mockCloud.point) throw new Error("the cloud painter was never built");
  return mockCloud.point;
}

function vValues(uv: Float32Array | null): number[] {
  if (!uv) throw new Error("the cloud painter was never built");
  const values: number[] = [];
  for (let index = 1; index < uv.length; index += 2) {
    values.push(uv[index]);
  }
  return values;
}

describe("PainterCellInfos ambient occlusion", () => {
  let context: TgdContext;
  let paint: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    mockCloud.point = null;
    mockCloud.uv = null;
    mockCloud.setUV.mockClear();
    paint = jest.fn();
    context = { paint } as unknown as TgdContext;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("puts the cloud up flat-shaded, before any occlusion is computed", () => {
    makePainter(context);

    expect(mockCloud.setUV).not.toHaveBeenCalled();
    expect(paint).not.toHaveBeenCalled();
    for (const v of vValues(mockCloud.uv)) {
      expect(v).toBe(0.5);
    }
  });

  it("applies the occlusion once, after the fact, and repaints", () => {
    makePainter(context);

    jest.runAllTimers();

    expect(mockCloud.setUV).toHaveBeenCalledTimes(1);
    expect(paint).toHaveBeenCalledTimes(1);
    const v = vValues(mockCloud.setUV.mock.calls[0][0]);
    // the middle of the cluster is the most occluded soma of the cloud
    expect(Math.max(...v)).toBe(1);
    // the outlier has no neighbour in radius
    expect(v[5]).toBe(0);
  });

  it("keeps a recolour flat-shaded while the occlusion is still computing", () => {
    const painter = makePainter(context);

    painter.recolor({
      palette: ["red", "green"],
      columnByCell: new Uint16Array(CELL_INFOS.length),
    });

    // the recolour uploaded the `[u, v]` array mid-computation: `v` must
    // still be the flat shading, not a half-done unnormalized total
    expect(mockCloud.setUV).toHaveBeenCalledTimes(1);
    for (const v of vValues(mockCloud.setUV.mock.calls[0][0])) {
      expect(v).toBe(0.5);
    }

    jest.runAllTimers();

    expect(mockCloud.setUV).toHaveBeenCalledTimes(2);
    const uv = mockCloud.setUV.mock.calls[1][0] as Float32Array;
    // the occlusion landed without disturbing the recolour's palette columns
    expect(Math.max(...vValues(uv))).toBe(1);
    expect(uv[0]).toBe((0 + 0.5) / 2);
  });

  it("never applies to a painter deleted mid-computation", () => {
    const painter = makePainter(context);

    painter.delete();
    jest.runAllTimers();

    expect(mockCloud.setUV).not.toHaveBeenCalled();
    expect(paint).not.toHaveBeenCalled();
  });

  describe("where the browser has requestIdleCallback", () => {
    afterEach(() => {
      delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback;
      delete (globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback;
    });

    it("rides it to the same single application", () => {
      (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback = (
        callback: (deadline: { didTimeout: boolean; timeRemaining(): number }) => void
      ) => setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 0);
      (globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback = (handle: number) =>
        clearTimeout(handle);

      const painter = makePainter(context);
      expect(mockCloud.setUV).not.toHaveBeenCalled();

      jest.runAllTimers();
      expect(mockCloud.setUV).toHaveBeenCalledTimes(1);

      // and cancellation goes through cancelIdleCallback the same way
      mockCloud.setUV.mockClear();
      const second = makePainter(context);
      second.delete();
      jest.runAllTimers();
      expect(mockCloud.setUV).not.toHaveBeenCalled();
      void painter;
    });
  });

  describe("given flat positions", () => {
    it("builds the identical cloud, occlusion included", () => {
      const fromInfos = makePainter(context);
      const infosPoint = mustPoint().slice();
      jest.runAllTimers();
      const infosUV = mockCloud.setUV.mock.calls[0][0] as Float32Array;

      mockCloud.point = null;
      mockCloud.setUV.mockClear();
      const fromFlat = new PainterCellInfos(context, {
        positions: POSITIONS,
        colors: null,
        somaRadius: 1,
      });
      jest.runAllTimers();
      const flatUV = mockCloud.setUV.mock.calls[0][0] as Float32Array;

      expect(mustPoint()).toEqual(infosPoint);
      expect(flatUV).toEqual(infosUV);
      expect(fromFlat.bbox.min).toEqual(fromInfos.bbox.min);
      expect(fromFlat.bbox.max).toEqual(fromInfos.bbox.max);
    });

    it("takes them over cellInfos wherever both are given", () => {
      new PainterCellInfos(context, {
        positions: new Float32Array([1, 2, 3]),
        cellInfos: CELL_INFOS,
        colors: null,
        somaRadius: 1,
      });

      expect(mustPoint()).toEqual(new Float32Array([1, 2, 3, 1]));
    });
  });
});

type RGBA = [number, number, number, number];

function parseColor(color: string): RGBA {
  if (color === "transparent") return [0, 0, 0, 0];

  const channels = /^rgba?\(([^)]+)\)$/.exec(color);
  if (channels) {
    const parts = channels[1].split(",").map((part) => Number.parseFloat(part));
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  }
  // `hsl()` and the named colours: opaque, and no assertion below turns on the
  // hue, only on how far the shade darkens it.
  return [128, 128, 128, 1];
}

class FakeGradient {
  private readonly stops: { offset: number; color: RGBA }[] = [];

  addColorStop(offset: number, color: string) {
    this.stops.push({ offset, color: parseColor(color) });
    this.stops.sort((a, b) => a.offset - b.offset);
  }

  at(position: number): RGBA {
    const [first] = this.stops;
    if (!first) return [0, 0, 0, 0];

    let previous = first;
    for (const stop of this.stops) {
      if (stop.offset >= position) {
        const span = stop.offset - previous.offset;
        const ratio = span > 0 ? (position - previous.offset) / span : 0;
        return previous.color.map(
          (channel, i) => channel + (stop.color[i] - channel) * ratio
        ) as RGBA;
      }
      previous = stop;
    }
    return previous.color;
  }
}

/**
 * Enough of a 2D context to paint the palette, since jsdom ships none and the
 * palette is where a soma that is not drawn is decided. Source-over
 * compositing over an RGBA grid, plus linear gradients read down `y`, which is
 * all `createPalette` asks for.
 */
class FakeContext {
  fillStyle: string | FakeGradient = "#000000";
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  createLinearGradient() {
    return new FakeGradient();
  }

  fillRect(x: number, y: number, width: number, height: number) {
    const { fillStyle } = this;
    for (let row = y; row < y + height; row++) {
      const source =
        typeof fillStyle === "string" ? parseColor(fillStyle) : fillStyle.at(row / this.height);
      for (let column = x; column < x + width; column++) {
        this.composite(column, row, source);
      }
    }
  }

  /** The live array, not a copy: nothing here reads it expecting a snapshot. */
  getImageData() {
    return { data: this.data };
  }

  putImageData() {}

  private composite(x: number, y: number, [red, green, blue, alpha]: RGBA) {
    const at = (y * this.width + x) * 4;
    const behind = this.data[at + 3] / 255;
    const result = alpha + behind * (1 - alpha);
    if (result === 0) return;

    this.data[at] = (red * alpha + this.data[at] * behind * (1 - alpha)) / result;
    this.data[at + 1] = (green * alpha + this.data[at + 1] * behind * (1 - alpha)) / result;
    this.data[at + 2] = (blue * alpha + this.data[at + 2] * behind * (1 - alpha)) / result;
    this.data[at + 3] = result * 255;
  }
}

/** One context per canvas, so what was painted is still there to read back. */
const fakeContexts = new WeakMap<HTMLCanvasElement, FakeContext>();

function installFakeCanvas() {
  HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
    const existing = fakeContexts.get(this);
    if (existing) return existing as unknown as CanvasRenderingContext2D;

    const context = new FakeContext(this.width, this.height);
    fakeContexts.set(this, context);
    return context as unknown as CanvasRenderingContext2D;
  } as HTMLCanvasElement["getContext"];
}

/** The palette as it was last uploaded, read one channel down one column. */
function channelDown(column: number, channel: number): number[] {
  if (!mockPalette.canvas) throw new Error("the palette was never uploaded");

  const context = fakeContexts.get(mockPalette.canvas);
  if (!context) throw new Error("the palette was painted without the fake context");

  const values: number[] = [];
  for (let row = 0; row < context.height; row++) {
    values.push(context.data[(row * context.width + column) * 4 + channel]);
  }
  return values;
}

const ALPHA = 3;
const RED = 0;
/** Rows in the palette canvas, which is `PALETTE_AO_ROWS` in the painter. */
const ROWS = 32;

/** Guards against a column read back empty, which would assert nothing. */
function expectDown(column: number, channel: number, value: number) {
  const values = channelDown(column, channel);
  expect(values).toHaveLength(ROWS);
  expect(values.filter((found) => found !== value)).toEqual([]);
}

describe("PainterCellInfos palette", () => {
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  let context: TgdContext;

  beforeEach(() => {
    mockPalette.canvas = null;
    installFakeCanvas();
    context = { paint: jest.fn() } as unknown as TgdContext;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = realGetContext;
  });

  /** Column 0 drawn, column 1 hidden, one soma in each. */
  function paint(opacity?: number): PainterCellInfos {
    return new PainterCellInfos(context, {
      positions: new Float32Array([0, 0, 0, 100, 0, 0]),
      colors: { palette: ["red", false], columnByCell: new Uint16Array([0, 1]) },
      somaRadius: 1,
      opacity,
    });
  }

  it("leaves a `false` column clear, the occlusion shade included", () => {
    paint();

    // Not merely dark: the shade is black at up to 55%, so compositing it over
    // a clear column would put a row of blobs where the somas should be gone.
    expectDown(1, ALPHA, 0);
    expectDown(0, ALPHA, 255);
  });

  it("still shades the columns that are drawn", () => {
    paint();

    const red = channelDown(0, RED);
    expect(red[red.length - 1]).toBeLessThan(red[0]);
  });

  it("does not let the opacity setting bring a hidden column back", () => {
    paint(0.5);

    expectDown(1, ALPHA, 0);
    expectDown(0, ALPHA, 128);
  });

  it("keeps a soma at zero opacity drawn rather than culled", () => {
    paint(0);

    // A step of alpha rather than none, so it stays out of the cloud's cull and
    // a spike can still light it, which is what zero opacity has always meant.
    expectDown(0, ALPHA, 1);
    expectDown(1, ALPHA, 0);
  });

  it("refuses colours whose columns describe other geometry, and says so", () => {
    const painter = paint();

    // Three columns for two somas: the host's colours have arrived and its
    // geometry has not.
    const taken = painter.recolor({
      palette: ["red", "blue"],
      columnByCell: new Uint16Array([0, 1, 0]),
    });

    expect(taken).toBe(false);
    // The hidden column it was built with, not the blue it was offered.
    expectDown(1, ALPHA, 0);
    expect(
      painter.recolor({ palette: ["red", "blue"], columnByCell: new Uint16Array([0, 1]) })
    ).toBe(true);
  });

  it("hides on a recolour too, without new geometry", () => {
    const painter = paint();

    painter.recolor({ palette: ["red", "blue"], columnByCell: new Uint16Array([0, 1]) });
    expectDown(1, ALPHA, 255);

    painter.recolor({ palette: ["red", false], columnByCell: new Uint16Array([0, 1]) });
    expectDown(1, ALPHA, 0);
  });
});

describe("hiddenSomaMask", () => {
  it("says nothing when the palette hides nothing", () => {
    const columnByCell = new Uint16Array([0, 1, 0, 1]);
    expect(hiddenSomaMask({ palette: ["red", null], columnByCell }, 4)).toBeNull();
    expect(hiddenSomaMask(null, 4)).toBeNull();
  });

  it("flags the somas whose column is not drawn", () => {
    const mask = hiddenSomaMask(
      { palette: ["red", false, "blue"], columnByCell: new Uint16Array([0, 1, 2, 1]) },
      4
    );

    expect(Array.from(mask ?? [])).toEqual([0, 1, 0, 1]);
  });

  it("clamps an out-of-range column the way the palette does", () => {
    // `writeColumns` sends a column past the end to the last one, so a mask
    // that did anything else would disagree with what is on screen.
    const mask = hiddenSomaMask(
      { palette: ["red", false], columnByCell: new Uint16Array([9, 0]) },
      2
    );

    expect(Array.from(mask ?? [])).toEqual([1, 0]);
  });

  it("sends somas the columns do not describe to the first column, as the palette does", () => {
    // The alternative was leaving them wherever `u` happened to point, which on
    // a palette this narrow is the hidden column itself: culled on screen, and
    // reported as pickable.
    const mask = hiddenSomaMask({ palette: [false], columnByCell: new Uint16Array([0]) }, 3);

    expect(Array.from(mask ?? [])).toEqual([1, 1, 1]);
  });

  it("fills an array it is handed rather than making one", () => {
    const into = new Float32Array(3);
    const colors = { palette: ["red", false] as const, columnByCell: new Uint16Array([1, 0, 1]) };

    const mask = hiddenSomaMask({ ...colors, palette: [...colors.palette] }, 3, into);

    expect(mask).toBe(into);
    expect(Array.from(into)).toEqual([1, 0, 1]);
  });

  it("writes every entry, so the last mask does not show through the next", () => {
    const into = new Float32Array([1, 1, 1]);

    hiddenSomaMask({ palette: ["red", false], columnByCell: new Uint16Array([0, 1, 0]) }, 3, into);

    expect(Array.from(into)).toEqual([0, 1, 0]);
  });

  it("makes its own when the one it is handed is the wrong size", () => {
    const into = new Float32Array(2);

    const mask = hiddenSomaMask({ palette: [false], columnByCell: new Uint16Array([0]) }, 3, into);

    expect(mask).not.toBe(into);
    expect(mask).toHaveLength(3);
  });

  it("keeps them pickable when that first column is drawn", () => {
    const mask = hiddenSomaMask({ palette: ["red", false], columnByCell: new Uint16Array([1]) }, 3);

    expect(Array.from(mask ?? [])).toEqual([1, 0, 0]);
  });
});
