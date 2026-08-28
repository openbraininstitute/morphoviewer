import { buildSomaCloudData } from "./soma-cloud-data";

import type { MorphoViewerSmallCircuitCell } from "../../types";

function cell(overrides: Partial<MorphoViewerSmallCircuitCell> = {}): MorphoViewerSmallCircuitCell {
  return {
    id: "circuit/default #0",
    center: [1, 2, 3],
    orientation: [0, 0, 0, 1],
    somaRadius: 7,
    color: "#f00",
    somaOnly: true,
    ...overrides,
  };
}

describe("buildSomaCloudData", () => {
  it("takes the cells drawn as a soma alone, and leaves the rest", () => {
    const { cells, dataPoint } = buildSomaCloudData([
      cell({ id: "a" }),
      cell({ id: "b", somaOnly: false }),
      cell({ id: "c", somaOnly: undefined }),
      cell({ id: "d" }),
    ]);

    expect(cells.map((c) => c.id)).toEqual(["a", "d"]);
    expect(dataPoint).toHaveLength(8);
  });

  it("packs each cell as its centre and radius", () => {
    const { dataPoint } = buildSomaCloudData([
      cell({ center: [1, 2, 3], somaRadius: 4 }),
      cell({ center: [5, 6, 7], somaRadius: 8 }),
    ]);

    expect([...dataPoint]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("gives each colour one palette column, shared by every cell wearing it", () => {
    const { palette, dataUV } = buildSomaCloudData([
      cell({ color: "#f00" }),
      cell({ color: "#0f0" }),
      cell({ color: "#f00" }),
    ]);

    expect(palette).toEqual(["#f00", "#0f0"]);
    // Sampled at the middle of the column it was given.
    expect([...dataUV]).toEqual([1 / 4, 0.5, 3 / 4, 0.5, 1 / 4, 0.5]);
  });

  it("takes the soma's colour from a cell coloured per section type", () => {
    const { palette } = buildSomaCloudData([
      cell({
        color: {
          soma: "#111",
          axon: "#222",
          basalDendrite: "#333",
          apicalDendrite: "#444",
          myelin: "#555",
          unknown: "#666",
        },
      }),
    ]);

    expect(palette).toEqual(["#111"]);
  });

  it("gives every cell without a colour the same one", () => {
    // Not a colour each, as `PainterCell` rolls: the cloud is rebuilt whole on every update,
    // and random colours would change on each of them.
    const { palette, dataUV } = buildSomaCloudData([
      cell({ color: undefined }),
      cell({ color: undefined }),
    ]);

    expect(palette).toHaveLength(1);
    expect(dataUV[0]).toBe(dataUV[2]);
  });

  it("has nothing to draw for a circuit of full morphologies", () => {
    const { cells, dataPoint, dataUV, palette } = buildSomaCloudData([cell({ somaOnly: false })]);

    expect(cells).toEqual([]);
    expect(dataPoint).toHaveLength(0);
    expect(dataUV).toHaveLength(0);
    expect(palette).toEqual([]);
  });
});
