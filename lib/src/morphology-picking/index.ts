/**
 * Shared GPU-picking pieces: turning a click on a morphology into `(section, offset)`.
 *
 * Internal — not re-exported from the package entry point. Used by both `MorphoViewerSimul`
 * and `MorphoViewerSmallCircuit`; `Structure` stays in the former because its dendrogram
 * ranks and liaison segments mean nothing to a circuit view.
 */
export { MaterialIndex } from "./material-index";
export { MaterialSegmentIndex } from "./material-segment-index";
export { computeSectionOffset } from "./section-offset";
export {
  decodeSegmentIndex,
  encodeSegmentIndex,
  spiralPixelOffsets,
} from "./segment-index-codec";

export type { PickableSegment, SectionSegmentIndex } from "./types";
