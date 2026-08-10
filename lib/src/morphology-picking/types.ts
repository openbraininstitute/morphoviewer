import type { ArrayNumber3 } from "@tolokoban/tgd";

/**
 * The part of a picked segment the offset maths needs.
 *
 * Kept narrow so a viewer need not produce a full `Structure` (dendrogram ranks, liaisons)
 * just to answer where along a section a click landed.
 */
export interface PickableSegment {
  /** Section this segment belongs to, in whatever namespace the host uses. */
  sectionName: string;
  /** Position within its section, counting from the section start. */
  segmentIndex: number;
  segmentLength: number;
  start: ArrayNumber3;
  end: ArrayNumber3;
}

/** Section-to-segments lookup. Segments must be ordered from the section start. */
export interface SectionSegmentIndex {
  getSegmentsOfSection(sectionName: string): PickableSegment[];
}
