import { CellSectionIndex } from "./section-index";

import type { ArrayNumber3 } from "@tolokoban/tgd";
import type { MorphoViewerTreeItem } from "@/components/morpho-viewer-simul";

// `@tolokoban/tgd` is published as ESM and jest does not transform node_modules. Nothing from
// it is used as a value here — only `ArrayNumber3`, which is a type.
jest.mock("@tolokoban/tgd", () => ({}));

function item(
  sectionId: string,
  segmentId: string,
  extra: Partial<MorphoViewerTreeItem> = {}
): MorphoViewerTreeItem {
  return {
    x: 0,
    y: 0,
    z: 0,
    radius: 1,
    type: 2,
    sectionId,
    segmentId,
    distanceFromSoma: 0,
    ...extra,
  } as MorphoViewerTreeItem;
}

const ORIGIN: ArrayNumber3 = [0, 0, 0];

describe("CellSectionIndex", () => {
  it("numbers segments in push order, which is what the pick buffer encodes", () => {
    const index = new CellSectionIndex();

    const first = index.add(item("dend[0]", "0"), ORIGIN, [3, 0, 0]);
    const second = index.add(item("dend[0]", "1"), [3, 0, 0], [3, 4, 0]);

    expect([first.index, second.index]).toEqual([0, 1]);
    expect(index.length).toBe(2);
    expect(index.get(1)).toBe(second);
  });

  it("resolves an out-of-range pick to nothing rather than to a neighbour", () => {
    const index = new CellSectionIndex();
    index.add(item("dend[0]", "0"), ORIGIN, [1, 0, 0]);

    expect(index.get(1)).toBeUndefined();
    expect(index.get(-1)).toBeUndefined();
  });

  it("measures each segment so offsets can be accumulated along a section", () => {
    const index = new CellSectionIndex();

    const segment = index.add(item("dend[0]", "0"), ORIGIN, [3, 4, 0]);

    expect(segment.segmentLength).toBeCloseTo(5);
  });

  it("groups segments by section, keeping them in order", () => {
    const index = new CellSectionIndex();
    index.add(item("dend[0]", "0"), ORIGIN, [1, 0, 0]);
    index.add(item("axon[0]", "0"), ORIGIN, [0, 1, 0]);
    index.add(item("dend[0]", "1"), [1, 0, 0], [2, 0, 0]);

    expect(index.getSegmentsOfSection("dend[0]").map((s) => s.segmentIndex)).toEqual([0, 1]);
    expect(index.getSegmentsOfSection("axon[0]")).toHaveLength(1);
    expect(index.getSegmentsOfSection("nope")).toEqual([]);
  });

  it("leaves the soma stub out of the section it leads to", () => {
    const index = new CellSectionIndex();

    index.add(item("dend[0]", "0"), ORIGIN, [8, 0, 0], true);
    index.add(item("dend[0]", "1"), [8, 0, 0], [58, 0, 0]);

    const measured = index.getSegmentsOfSection("dend[0]");
    expect(measured.map((s) => s.segmentIndex)).toEqual([1]);
    expect(measured.reduce((sum, s) => sum + s.segmentLength, 0)).toBeCloseTo(50);
    expect(index.length).toBe(2);
    expect(index.get(0)?.isSomaStub).toBe(true);
  });

  it("keeps the stub when it is all a section has", () => {
    const index = new CellSectionIndex();

    index.add(item("dend[0]", "0"), ORIGIN, [8, 0, 0], true);

    expect(index.getSegmentsOfSection("dend[0]")).toHaveLength(1);
  });

  it("places a point at an offset measured without the stub", () => {
    const index = new CellSectionIndex();
    index.add(item("dend[0]", "0"), ORIGIN, [8, 0, 0], true);
    index.add(item("dend[0]", "1"), [8, 0, 0], [58, 0, 0]);

    expect(index.getPointAtOffset("dend[0]", 0.5)).toEqual([33, 0, 0]);
  });

  it("carries the SONATA section id through when the tree has one", () => {
    const index = new CellSectionIndex();

    const withId = index.add(item("dend[0]", "0", { sonataSectionId: 12 }), ORIGIN, [1, 0, 0]);
    const withoutId = index.add(item("dend[1]", "0"), ORIGIN, [1, 0, 0]);

    expect(withId.sonataSectionId).toBe(12);
    expect(withoutId.sonataSectionId).toBeUndefined();
  });

  it("falls back to arrival order when segment ids are not numbers", () => {
    // Trees built from SWC parsed in the browser use ids like `7.1`, and other sources may use
    // none at all. Ordering within the section is all the offset maths needs.
    const index = new CellSectionIndex();

    index.add(item("dend[0]", "not-a-number"), ORIGIN, [1, 0, 0]);
    index.add(item("dend[0]", "also-not"), [1, 0, 0], [2, 0, 0]);

    expect(index.getSegmentsOfSection("dend[0]").map((s) => s.segmentIndex)).toEqual([0, 1]);
  });
});

/**
 * The pick buffer stores `v` as a colour, so the encoded value survives a round trip through
 * 8 bits per channel. These reproduce that path to pin down how many segments one cell may
 * have before two of them collide onto the same colour.
 */
describe("segment index encoding", () => {
  /** Matches `makeUV` in `factory/tree.ts`. */
  const encode = (index: number, count: number) => (index + 1.5) / (count + 2);

  /** Matches `float01ToVec3` followed by the read-back in `OffscreenPainter.getItemAt`. */
  const throughColour = (value: number) => Math.round(value * 0xffffff) / 0xffffff;

  /** Matches `OffscreenPainter.getItemAt`. */
  const decode = (value: number, count: number) => Math.floor((count + 2) * value) - 1;

  it.each([1, 2, 100, 10_000, 100_000])("round-trips every index of a %i-segment cell", (count) => {
    for (const index of [0, 1, Math.floor(count / 2), count - 2, count - 1]) {
      if (index < 0) continue;
      expect(decode(throughColour(encode(index, count)), count)).toBe(index);
    }
  });

  it("decodes an untouched pixel to no segment at all", () => {
    // The offscreen pass clears to black, so a pixel where nothing was drawn reads back as 0.
    expect(decode(0, 1000)).toBeLessThan(0);
  });
});
