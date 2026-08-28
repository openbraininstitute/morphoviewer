import { isSameCell } from "./same-cell";

import type { MorphoViewerSmallCircuitCell } from "../types";

function cell(overrides: Partial<MorphoViewerSmallCircuitCell> = {}): MorphoViewerSmallCircuitCell {
  return {
    id: "circuit/default #0",
    center: [1, 2, 3],
    orientation: [0, 0, 0, 1],
    somaRadius: 7,
    color: "#f00",
    ...overrides,
  };
}

describe("isSameCell", () => {
  it("keeps a cell that came back with the same values", () => {
    expect(isSameCell(cell(), cell())).toBe(true);
  });

  it("keeps a cell whose id alone is different", () => {
    // The reload key rides on the id, and the caller has already matched on it.
    expect(isSameCell(cell(), cell({ id: "circuit/default #0?axons=true" }))).toBe(true);
  });

  it("sees a population that changed places on the screen", () => {
    // Colour and orientation both turn over when a population goes from context to on show.
    expect(isSameCell(cell(), cell({ color: "#0f0" }))).toBe(false);
    expect(isSameCell(cell(), cell({ orientation: [0, 1, 0, 0] }))).toBe(false);
    expect(isSameCell(cell(), cell({ center: [1, 2, 4] }))).toBe(false);
    expect(isSameCell(cell(), cell({ somaRadius: 8 }))).toBe(false);
  });

  it("sees a cell that stopped waiting for a morphology", () => {
    expect(isSameCell(cell(), cell({ somaOnly: true }))).toBe(false);
    // Left out and said out loud mean the same thing.
    expect(isSameCell(cell(), cell({ somaOnly: false }))).toBe(true);
  });

  it("keeps a cell that has no colour of its own", () => {
    // The painter picked one at random; calling that a change would repaint the whole scene
    // in new colours every time anything else moved.
    expect(isSameCell(cell({ color: undefined }), cell({ color: undefined }))).toBe(true);
  });

  it("compares a colour given per section type", () => {
    const colors = {
      soma: "#111",
      axon: "#222",
      basalDendrite: "#333",
      apicalDendrite: "#444",
      myelin: "#555",
      unknown: "#666",
    };
    expect(isSameCell(cell({ color: colors }), cell({ color: { ...colors } }))).toBe(true);
    expect(isSameCell(cell({ color: colors }), cell({ color: { ...colors, axon: "#999" } }))).toBe(
      false
    );
    expect(isSameCell(cell({ color: colors }), cell({ color: "#111" }))).toBe(false);
  });
});
