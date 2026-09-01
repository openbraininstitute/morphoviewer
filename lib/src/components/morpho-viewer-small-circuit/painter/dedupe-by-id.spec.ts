import { dedupeById } from "./dedupe-by-id";

import type { MorphoViewerSmallCircuitCell } from "../types";

function cell(id: string): MorphoViewerSmallCircuitCell {
  return { id, center: [0, 0, 0], orientation: [0, 0, 0, 1], somaRadius: 1 };
}

describe("dedupeById", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("hands back the very same array when every id is its own", () => {
    // Identity, not a copy: `setCircuit` recognises a circuit it has already
    // taken by comparing the array it was given with the one it kept.
    const circuit = [cell("a"), cell("b")];

    expect(dedupeById(circuit)).toBe(circuit);
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps the first of the cells sharing an id, and says so", () => {
    const first = cell("a");
    const circuit = [first, cell("b"), cell("a")];

    expect(dedupeById(circuit)).toEqual([first, circuit[1]]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("counts every cell it left out", () => {
    dedupeById([cell("a"), cell("a"), cell("a")]);

    expect(warn.mock.calls[0][0]).toContain("2 of them repeat");
  });
});
