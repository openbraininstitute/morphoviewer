import type { MorphoViewerSmallCircuitCell } from "../types";

/**
 * The circuit with one cell per id.
 *
 * The id is what the cell painters, the pick buffer and the morphology cache are all filed
 * under, so a repeated one takes the first cell's place in every map of them: the first
 * painter is left drawing into the pick buffer with nothing holding it, under an index no
 * update can reclaim, decoding to a cell that is no longer there.
 *
 * The array comes back untouched when there is nothing to drop, so the identity check that
 * recognises a circuit the host handed twice still holds.
 */
export function dedupeById(
  circuit: MorphoViewerSmallCircuitCell[]
): MorphoViewerSmallCircuitCell[] {
  const seen = new Set<string>();
  const kept = circuit.filter((cell) => {
    if (seen.has(cell.id)) return false;

    seen.add(cell.id);
    return true;
  });
  if (kept.length === circuit.length) return circuit;

  console.warn(
    `Cell ids must be unique, but ${circuit.length - kept.length} of them repeat one already in the circuit. Those cells were left out: an id names a cell to the painters, to the pick buffer and to the morphology cache alike.`
  );
  return kept;
}
