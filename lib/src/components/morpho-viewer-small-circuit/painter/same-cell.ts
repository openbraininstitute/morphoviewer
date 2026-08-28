import type { MorphoViewerSmallCircuitCell, SectionColors } from "../types";

/**
 * Whether two cells would be drawn the same way.
 *
 * Field by field rather than by id, because an id names a node and the same node is drawn
 * differently depending on the company it keeps: the population on show is coloured by
 * property, stood in its recorded orientation and given a morphology, and the ones beside it
 * are grey somas. A cell with no colour of its own is left to the painter holding it — that
 * colour is picked at random, so calling it a change would repaint the scene in new colours
 * every time anything else moved.
 */
export function isSameCell(
  a: MorphoViewerSmallCircuitCell,
  b: MorphoViewerSmallCircuitCell
): boolean {
  return (
    a.somaRadius === b.somaRadius &&
    (a.somaOnly ?? false) === (b.somaOnly ?? false) &&
    a.center.every((value, index) => value === b.center[index]) &&
    a.orientation.every((value, index) => value === b.orientation[index]) &&
    isSameColor(a.color, b.color)
  );
}

/** One CSS colour for the whole cell, or one per section type. */
function isSameColor(
  a: MorphoViewerSmallCircuitCell["color"],
  b: MorphoViewerSmallCircuitCell["color"]
): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a === "string" || typeof b === "string") return false;

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof SectionColors>;
  return [...keys].every((key) => a[key] === b[key]);
}
