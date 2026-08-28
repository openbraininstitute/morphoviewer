/**
 * Shared GPU-picking pieces: turning a click into what lies under it — which cell, and
 * where on its morphology.
 *
 * Internal — not re-exported from the package entry point. Used by `MorphoViewerSimul`,
 * `MorphoViewerSmallCircuit` and `MorphoViewerSomasOnly`; `Structure` stays in the first
 * because its dendrogram ranks and liaison segments mean nothing to a circuit view.
 */
export { MaterialIndex } from "./material-index";
export { MaterialSegmentIndex } from "./material-segment-index";
export { decodePickColor, encodePickColor } from "./pick-color-codec";
export { computeSectionOffset } from "./section-offset";
export {
  decodeSegmentIndex,
  encodeSegmentIndex,
  spiralPixelOffsets,
} from "./segment-index-codec";

export type { PickableSegment, SectionSegmentIndex } from "./types";
