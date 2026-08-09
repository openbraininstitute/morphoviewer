import type { ArrayNumber3 } from "@tolokoban/tgd";
import type {
  MorphoViewerTreeItem,
  MorphoViewerTreeItemType,
} from "@/components/morpho-viewer-simul";
import type { PickableSegment, SectionSegmentIndex } from "@/morphology-picking";

/** One drawn segment of one cell, kept so a GPU pick can be resolved back to a location. */
export interface CellSegment extends PickableSegment {
  /** Position in this cell's segment list — the value written into the pick buffer. */
  index: number;
  /** SONATA global section id, when the tree carried one. */
  sonataSectionId?: number;
  /** Soma / axon / basal / apical — what the section is, not just which one it is. */
  sectionType: MorphoViewerTreeItemType;
  /** Where this segment sits once morphed into the dendrogram. */
  chartStart: ArrayNumber3;
  chartEnd: ArrayNumber3;
}

/**
 * Per-cell record of the segments pushed to the GPU, in push order.
 *
 * Without it a pick can only say "this cell"; with it, "this cell, that section, this far
 * along". Smaller than `morpho-viewer-simul`'s `Structure`, which also carries dendrogram
 * ranks and liaison segments.
 */
export class CellSectionIndex implements SectionSegmentIndex {
  private readonly segments: CellSegment[] = [];
  private readonly bySection = new Map<string, CellSegment[]>();

  /**
   * Record the segment drawn from `start` to `end` for `item`, and return it.
   *
   * A geometry segment runs from a node's parent to the node, so section and position come
   * from `item` — the far end — matching how `collectSegments` picks a colour.
   */
  add(
    item: MorphoViewerTreeItem,
    start: ArrayNumber3,
    end: ArrayNumber3,
    chartStart: ArrayNumber3 = start,
    chartEnd: ArrayNumber3 = end
  ): CellSegment {
    const sectionName = item.sectionId;
    const siblings = this.bySection.get(sectionName) ?? [];
    const parsed = Number.parseInt(item.segmentId, 10);
    const segment: CellSegment = {
      index: this.segments.length,
      sectionName,
      // Sources without per-section numbering carry unparsable ids; arrival order still
      // satisfies the ordering `computeSectionOffset` relies on.
      segmentIndex: Number.isNaN(parsed) ? siblings.length : parsed,
      segmentLength: distance(start, end),
      start,
      end,
      chartStart,
      chartEnd,
      sonataSectionId: item.sonataSectionId,
      sectionType: item.type,
    };
    this.segments.push(segment);
    siblings.push(segment);
    this.bySection.set(sectionName, siblings);
    return segment;
  }

  /** Number of recorded segments — the range the pick buffer has to encode. */
  get length(): number {
    return this.segments.length;
  }

  /** Resolve a decoded pick index, or `undefined` when it falls outside this cell. */
  get(index: number): CellSegment | undefined {
    return this.segments[index];
  }

  getSegmentsOfSection(sectionName: string): CellSegment[] {
    return this.bySection.get(sectionName) ?? [];
  }

  /**
   * What kind of section this is, or `undefined` if the name is unknown.
   *
   * Needed for markers restored from a config, which carry only a section id and an offset.
   */
  getSectionType(sectionName: string): MorphoViewerTreeItemType | undefined {
    return this.bySection.get(sectionName)?.[0]?.sectionType;
  }

  /**
   * The point `offset` of the way along a section, in the morphology's own coordinates.
   *
   * Inverse of a pick, so a stored `(section, offset)` can be drawn back as a marker.
   */
  /**
   * Point at a normalised offset along a section.
   *
   * @param mix - Dendrogram morph: 0 reads the morphology, 1 the chart.
   */
  getPointAtOffset(sectionName: string, offset: number, mix = 0): ArrayNumber3 | null {
    const segments = this.getSegmentsOfSection(sectionName);
    if (segments.length === 0) return null;

    const total = segments.reduce((sum, segment) => sum + segment.segmentLength, 0);
    if (total <= 0) return at(segments[0], 0, mix);

    const target = Math.min(Math.max(offset, 0), 1) * total;
    let walked = 0;
    for (const segment of segments) {
      if (walked + segment.segmentLength >= target) {
        const within = segment.segmentLength > 0 ? (target - walked) / segment.segmentLength : 0;
        return at(segment, within, mix);
      }
      walked += segment.segmentLength;
    }
    return at(segments[segments.length - 1], 1, mix);
  }
}

function lerp(from: ArrayNumber3, to: ArrayNumber3, alpha: number): ArrayNumber3 {
  return [
    from[0] + (to[0] - from[0]) * alpha,
    from[1] + (to[1] - from[1]) * alpha,
    from[2] + (to[2] - from[2]) * alpha,
  ];
}

function distance([x1, y1, z1]: ArrayNumber3, [x2, y2, z2]: ArrayNumber3): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2);
}

/** Point along a segment, blended between its morphology and dendrogram placements. */
function at(segment: CellSegment, within: number, mix: number): ArrayNumber3 {
  const solid = lerp(segment.start, segment.end, within);
  if (mix <= 0) return solid;
  const chart = lerp(segment.chartStart, segment.chartEnd, within);
  return lerp(solid, chart, mix);
}
