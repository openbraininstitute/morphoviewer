import {
  type ArrayNumber2,
  type ArrayNumber3,
  type ArrayNumber4,
  TgdBoundingBox,
  type TgdContext,
  type TgdMaterial,
  TgdPainterNode,
  TgdPainterSegments,
  TgdPainterSegmentsData,
} from "@tolokoban/tgd";

import {
  type MorphoViewerTree,
  type MorphoViewerTreeItem,
  MorphoViewerTreeItemType,
} from "@/components/morpho-viewer-simul";
import { encodeSegmentIndex } from "@/morphology-picking";

import { CellSectionIndex } from "./section-index";

/** One segment waiting to be uploaded, held until the cell's segment count is known. */
interface PendingSegment {
  item: MorphoViewerTreeItem;
  parentType: MorphoViewerTreeItemType;
  start: ArrayNumber3;
  end: ArrayNumber3;
  radiusStart: number;
  radiusEnd: number;
  /** Soma and neurites go to separate datasets so they can be drawn with different roundness. */
  isSoma: boolean;
}

export function createCellFromTree(
  context: TgdContext,
  material: TgdMaterial,
  tree: MorphoViewerTree,
  forSelection: boolean
): { bbox: TgdBoundingBox; node: TgdPainterNode; sections: CellSectionIndex } {
  // Two passes: the per-segment index is encoded as a fraction of the cell's total segment
  // count, and that total is only known once the whole tree has been walked.
  const pending: PendingSegment[] = [];
  for (const item of tree.roots) {
    collectSegments(undefined, item, pending);
  }

  // One index across both datasets: soma and neurites are drawn by separate painters but
  // share one pick buffer, so a decoded value has to be unambiguous across the whole cell.
  const sections = new CellSectionIndex();
  const segmentsSoma = new TgdPainterSegmentsData();
  const segmentsNeurites = new TgdPainterSegmentsData();
  for (const segment of pending) {
    const recorded = sections.add(segment.item, segment.start, segment.end);
    const uv0 = makeUV(segment.parentType, recorded.index, pending.length);
    const uv1 = makeUV(segment.item.type, recorded.index, pending.length);
    const target = segment.isSoma ? segmentsSoma : segmentsNeurites;
    target.add(
      [...segment.start, segment.radiusStart] as ArrayNumber4,
      [...segment.end, segment.radiusEnd] as ArrayNumber4,
      uv0,
      uv1
    );
  }

  const bbox = new TgdBoundingBox();
  for (const segments of [segmentsSoma, segmentsNeurites]) {
    for (let i = 0; i < segments.count; i++) {
      const [x0, y0, z0, r0] = segments.getXYZR0(i);
      bbox.addSphere(x0, y0, z0, r0 * 2);
      const [x1, y1, z1, r1] = segments.getXYZR1(i);
      bbox.addSphere(x1, y1, z1, r1 * 2);
    }
  }
  const painterSoma = new TgdPainterSegments(context, {
    roundness: forSelection ? 5 : 12,
    radiusMultiplier: forSelection ? 1.1 : 1,
    material,
    dataset: segmentsSoma.makeDataset(),
  });
  painterSoma.name = "painterSoma";
  const painterNeurites = new TgdPainterSegments(context, {
    roundness: forSelection ? 3 : 5,
    minRadius: 2,
    radiusMultiplier: forSelection ? 1.6 : 1,
    material,
    dataset: segmentsNeurites.makeDataset(),
  });
  painterNeurites.name = "painterNeurites";
  return {
    bbox,
    sections,
    node: new TgdPainterNode({
      children: [painterSoma, painterNeurites],
    }),
  };
}

function collectSegments(
  parent: MorphoViewerTreeItem | undefined,
  item: MorphoViewerTreeItem,
  pending: PendingSegment[]
) {
  const from = parent ?? item;
  pending.push({
    item,
    parentType: parent?.type ?? item.type,
    start: [from.x, from.y, from.z],
    end: [item.x, item.y, item.z],
    radiusStart: from.radius,
    radiusEnd: item.radius,
    // A root has no parent, so it is drawn as a degenerate segment on itself — a sphere at
    // the soma. Soma-typed children keep the rounder soma painter too.
    isSoma: !parent || item.type === MorphoViewerTreeItemType.Soma,
  });
  for (const child of item.children ?? []) {
    collectSegments(item, child, pending);
  }
}

/**
 * `u` picks the colour from the horizontal palette; `v` carries the segment index.
 *
 * `v` was previously always `0` and unused: the palette canvas is a single row, so any `v`
 * samples the same texel and the visible colours are unaffected by what is stored there. The
 * offscreen pick material reads it instead of the colour.
 */
function makeUV(
  type: MorphoViewerTreeItemType,
  segmentIndex: number,
  segmentCount: number
): ArrayNumber2 {
  return [computeCoordU(type), encodeSegmentIndex(segmentIndex, segmentCount)];
}

/**
 * U texture coordinate is for the sections.
 * We use an horizontal palette of 6 colors.
 */
function computeCoordU(type: MorphoViewerTreeItemType): number {
  const types: MorphoViewerTreeItemType[] = [
    MorphoViewerTreeItemType.Soma,
    MorphoViewerTreeItemType.Axon,
    MorphoViewerTreeItemType.BasalDendrite,
    MorphoViewerTreeItemType.ApicalDendrite,
    MorphoViewerTreeItemType.Myelin,
    MorphoViewerTreeItemType.Unknown,
  ];
  return (types.indexOf(type) + 0.5) / types.length;
}
