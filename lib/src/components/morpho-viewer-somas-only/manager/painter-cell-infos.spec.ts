import { PainterCellInfos } from "./painter-cell-infos";

import type { TgdContext } from "@tolokoban/tgd";
import type { MorphoViewerCellInfo } from "../types";

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
    loadBitmap() {
      return this;
    }
    delete() {}
  },
}));

// The cloud painter owns the GPU side; here it only has to remember the
// `[u, v]` array it was built around and record what `setUV` pushes.
const mockCloud: { uv: Float32Array | null; setUV: jest.Mock } = {
  uv: null,
  setUV: jest.fn(),
};
jest.mock("./painter-soma-cloud", () => ({
  PainterSomaCloud: class {
    radiusMultiplier = 1;
    constructor(_context: unknown, options: { dataUV: Float32Array }) {
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
});
