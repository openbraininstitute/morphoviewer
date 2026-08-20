import {
  type ArrayNumber2,
  type ArrayNumber3,
  type ArrayNumber4,
  TgdBoundingBox,
  type TgdContext,
  type TgdMaterial,
  TgdPainterNode,
  TgdPainterSegmentsData,
  TgdPainterSegmentsMorphing,
} from "@tolokoban/tgd";

import {
  type MorphoViewerTree,
  type MorphoViewerTreeItem,
  MorphoViewerTreeItemType,
} from "@/components/morpho-viewer-simul";
import { encodeSegmentIndex } from "@/morphology-picking";

import { CellSectionIndex } from "./section-index";

/** Pixel floor on stroke radius: wider in 3D, finer in the chart so its weight band survives. */
const SOLID_MIN_RADIUS_IN_PIXELS = 2;
const CHART_MIN_RADIUS_IN_PIXELS = 1;

/** One segment waiting to be uploaded, held until the cell's segment count is known. */
interface PendingSegment {
  item: MorphoViewerTreeItem;
  parent?: MorphoViewerTreeItem;
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
  forSelection: boolean,
  somaAsSphere = false
): {
  bbox: TgdBoundingBox;
  node: TgdPainterNode;
  sections: CellSectionIndex;
  setDendrogramMix(mix: number): void;
} {
  // Two passes: a segment's index is a fraction of the total, known only after the walk.
  const pending: PendingSegment[] = [];
  for (const item of tree.roots) {
    collectSegments(undefined, item, pending);
  }

  // One index across both datasets: they share a pick buffer, so it must be unambiguous.
  const sections = new CellSectionIndex();
  const segmentsSoma = new TgdPainterSegmentsData();
  const segmentsNeurites = new TgdPainterSegmentsData();
  // Chart twins: same segments in the same order, since the morph pairs them by index.
  const dendroSoma = new TgdPainterSegmentsData();
  const dendroNeurites = new TgdPainterSegmentsData();

  const spread = spanOf(pending);
  const { placements, leafCount } = computeDendrogramPlacements(
    tree.roots,
    spread.width,
    spread.height
  );
  const weights = chartWeights(pending, spread, leafCount);
  const somaOrigin: ArrayNumber3 = [0, dendrogramOriginY(spread.height), 0];
  const somaSphere = fitSomaSphere(pending);
  let somaDrawn = false;

  for (const segment of pending) {
    const somaAlreadyDrawn = segment.isSoma && somaDrawn;
    if (segment.isSoma) somaDrawn = true;

    const own = placements.get(segment.item);
    const parentPlacement = segment.parent ? placements.get(segment.parent) : undefined;
    let chart: { start: ArrayNumber3; end: ArrayNumber3 };
    if (segment.isSoma) {
      chart = { start: somaOrigin, end: somaOrigin };
    } else if (own) {
      chart = dendrogramSegment(own);
    } else {
      chart = { start: segment.start, end: segment.end };
    }

    // Stubs keep their own weight: inheriting the soma's radius and colour would grow a fat
    // grey cone out of the cell body. They start at the sphere centre only when the soma is
    // drawn as one, since otherwise the contour point they leave from is still drawn.
    const stubOffSoma =
      segment.parent?.type === MorphoViewerTreeItemType.Soma &&
      segment.item.type !== MorphoViewerTreeItemType.Soma;
    // Both placements, so a marker resolved from an offset follows the morph.
    const recorded = sections.add(
      segment.item,
      segment.start,
      segment.end,
      stubOffSoma,
      chart.start,
      chart.end
    );
    const uv0 = makeUV(segment.parentType, recorded.index, pending.length);
    const uv1 = makeUV(segment.item.type, recorded.index, pending.length);
    const target = segment.isSoma ? segmentsSoma : segmentsNeurites;
    const dendroTarget = segment.isSoma ? dendroSoma : dendroNeurites;

    // Right-angle connector, drawn before its branch. Soma-parented bars anchor at x=0,
    // which is what forms the baseline.
    if (!segment.isSoma && segment.parent && own) {
      const parentIsSoma = segment.parent.type === MorphoViewerTreeItemType.Soma;
      const parentX = parentIsSoma ? 0 : (parentPlacement?.x ?? own.x);
      if (parentX !== own.x) {
        const liaison = dendrogramLiaison(parentX, own);
        // Equal weights: the shader lerps radius with position.
        target.add(
          [...segment.start, weights.liaison] as ArrayNumber4,
          [...segment.start, weights.liaison] as ArrayNumber4,
          uv0,
          uv1
        );
        dendroTarget.add(
          [...liaison.start, weights.liaison] as ArrayNumber4,
          [...liaison.end, weights.liaison] as ArrayNumber4,
          uv1,
          uv1
        );
      }
    }

    if (segment.isSoma && somaAsSphere) {
      // One fitted sphere, not the contour chain. Later entries keep their slot at radius 0.
      const radius = somaAlreadyDrawn ? 0 : somaSphere.radius;
      target.add(
        [...somaSphere.center, radius] as ArrayNumber4,
        [...somaSphere.center, radius] as ArrayNumber4,
        uv1,
        uv1
      );
    } else {
      // A branch's first segment inherits its start radius and colour from its parent —
      // which, at the soma, is a contour point as wide as the cell body. Drawn literally
      // that is a fat cone in the branch's colour erupting from the soma, burying it. The
      // stub keeps its own calibre and colour; it moves to the sphere's centre only when
      // the sphere replaces the contour, so it still emerges from the drawn body.
      target.add(
        [
          ...(stubOffSoma && somaAsSphere ? somaSphere.center : segment.start),
          stubOffSoma ? Math.min(segment.radiusStart, segment.radiusEnd) : segment.radiusStart,
        ] as ArrayNumber4,
        [...segment.end, segment.radiusEnd] as ArrayNumber4,
        stubOffSoma ? uv1 : uv0,
        uv1
      );
    }
    // Straight cylinders at one weight, from the segment's own far radius. Reading
    // `radiusStart` here would inherit the soma's, growing a wedge from every root.
    const chartRadius = segment.isSoma
      ? somaAlreadyDrawn
        ? 0
        : weights.somaBall
      : weights.stroke(segment.radiusEnd);
    dendroTarget.add(
      [...chart.start, chartRadius] as ArrayNumber4,
      [...chart.end, chartRadius] as ArrayNumber4,
      uv1,
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
  const painterSoma = new TgdPainterSegmentsMorphing(context, {
    roundness: forSelection ? 5 : 12,
    minRadius: SOLID_MIN_RADIUS_IN_PIXELS,
    radiusMultiplier: forSelection ? 1.1 : 1,
    material,
    datasetsPairs: [[segmentsSoma.makeDataset(), dendroSoma.makeDataset()]],
  });
  painterSoma.name = "painterSoma";
  const painterNeurites = new TgdPainterSegmentsMorphing(context, {
    roundness: forSelection ? 3 : 5,
    minRadius: SOLID_MIN_RADIUS_IN_PIXELS,
    radiusMultiplier: forSelection ? 1.6 : 1,
    material,
    datasetsPairs: [[segmentsNeurites.makeDataset(), dendroNeurites.makeDataset()]],
  });
  painterNeurites.name = "painterNeurites";
  return {
    bbox,
    sections,
    setDendrogramMix(mix: number) {
      painterSoma.mix = mix;
      painterNeurites.mix = mix;
      // At chart framing the whole weight band sits under the 3D pixel floor, which would
      // flatten it to a uniform hairline. Ease the floor down with the morph — but only for
      // what is seen: on a pick buffer a generous target beats fidelity.
      if (forSelection) return;
      const floor =
        SOLID_MIN_RADIUS_IN_PIXELS -
        (SOLID_MIN_RADIUS_IN_PIXELS - CHART_MIN_RADIUS_IN_PIXELS) * mix;
      painterSoma.minRadius = floor;
      painterNeurites.minRadius = floor;
    },
    node: new TgdPainterNode({
      children: [painterSoma, painterNeurites],
    }),
  };
}

/**
 * One sphere standing in for the soma's contour chain.
 *
 * Centred on the contour's mean; radius is the larger of the spread around that centre and the
 * largest per-point radius, covering both contour somas and stacked-point somas.
 */
function fitSomaSphere(pending: PendingSegment[]): { center: ArrayNumber3; radius: number } {
  const points: { p: ArrayNumber3; r: number }[] = [];
  for (const segment of pending) {
    if (segment.isSoma) points.push({ p: segment.end, r: segment.radiusEnd });
  }
  if (!points.length) return { center: [0, 0, 0], radius: 0 };

  const center: ArrayNumber3 = [0, 0, 0];
  for (const { p } of points) {
    center[0] += p[0] / points.length;
    center[1] += p[1] / points.length;
    center[2] += p[2] / points.length;
  }
  let meanDistance = 0;
  let maxRadius = 0;
  for (const { p, r } of points) {
    meanDistance +=
      Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]) / points.length;
    maxRadius = Math.max(maxRadius, r);
  }
  return { center, radius: Math.max(meanDistance, maxRadius) };
}

/**
 * Stroke weights for the chart, in world units.
 *
 * The chart's y axis is path distance, not space, so radius there is styling rather than
 * measurement. Scaled to the chart's own geometry so cells of any size look alike, and ordered
 * connectors < branches < soma.
 */
interface ChartWeights {
  stroke(radius: number): number;
  liaison: number;
  somaBall: number;
}

function chartWeights(
  pending: PendingSegment[],
  spread: { width: number; height: number },
  leafCount: number
): ChartWeights {
  // Bounded by both axes: a bushy cell is limited by the room between columns, a sparse one by
  // the chart's height, so neither ends up with strokes that swamp its own layout. On a real
  // cell this is what governs; the morphology's own calibre is only a floor, for the nearly
  // linear cases where both geometric bounds collapse and every mark would land on the pixel
  // floor together.
  const [lo, hi] = neuriteRadiusRange(pending);
  const pitch = spread.width / Math.max(1, leafCount);
  const unit = Math.max(hi * 0.5, Math.min(0.2 * pitch, 0.0035 * spread.height));
  const min = unit / 3;
  const span = Math.log(hi) - Math.log(lo);

  return {
    liaison: min,
    // The node every branch descends from, so it has to outweigh all of them.
    somaBall: 3.5 * unit,
    stroke(radius) {
      if (span < 1e-6) return (min + unit) / 2;
      const t = (Math.log(Math.max(radius, 1e-6)) - Math.log(lo)) / span;
      return min + (unit - min) * Math.min(1, Math.max(0, t));
    },
  };
}

/**
 * The 5th and 95th percentile neurite radius, from an evenly spaced sample.
 *
 * Percentiles, not extremes: one fat point would squeeze every other branch to the floor.
 * Sampled rather than sorted — a reconstruction carries tens of thousands of segments.
 */
function neuriteRadiusRange(pending: PendingSegment[]): [number, number] {
  const SAMPLE_LIMIT = 2048;
  const stride = Math.max(1, Math.ceil(pending.length / SAMPLE_LIMIT));
  const radii: number[] = [];
  for (let i = 0; i < pending.length; i += stride) {
    if (!pending[i].isSoma) radii.push(pending[i].radiusEnd);
  }
  if (!radii.length) return [1, 1];

  radii.sort((a, b) => a - b);
  const at = (quantile: number) =>
    radii[Math.min(radii.length - 1, Math.floor(quantile * radii.length))];
  const lo = Math.max(1e-6, at(0.05));
  return [lo, Math.max(lo * 1.0001, at(0.95))];
}

/** Extent of the cell in 3D, used to size the chart so the morph stays roughly in frame. */
function spanOf(pending: PendingSegment[]): { width: number; height: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const { end } of pending) {
    minX = Math.min(minX, end[0]);
    maxX = Math.max(maxX, end[0]);
    minY = Math.min(minY, end[1]);
    maxY = Math.max(maxY, end[1]);
  }
  if (!Number.isFinite(minX)) return { width: 1, height: 1 };
  return { width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function collectSegments(
  parent: MorphoViewerTreeItem | undefined,
  item: MorphoViewerTreeItem,
  pending: PendingSegment[]
) {
  const from = parent ?? item;
  pending.push({
    item,
    parent,
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

/**
 * Where a segment sits in the dendrogram: branching across x, path distance up y.
 *
 * A private copy of the single-neuron viewer's layout rather than a shared module — that
 * viewer ships in unrelated flows, and a second copy costs less than the risk of editing it.
 */
interface DendrogramPlacement {
  /** Column this node occupies. A child hangs from its parent's column down to its own. */
  x: number;
  top: number;
  bottom: number;
}

interface Metrics {
  distanceFromSoma: number;
  segmentLength: number;
  leavesCount: number;
  rank: number;
}

/** Fraction of the tree's height placed above the origin, so it straddles the camera target. */
const CENTER_Y = 0.4;

/** The y of a node at zero path distance — the baseline every branch grows from. */
function dendrogramOriginY(height: number): number {
  return -height * CENTER_Y;
}

function distance(a: MorphoViewerTreeItem, b: MorphoViewerTreeItem): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/**
 * Measure every node: segment length, path distance from the soma, and leaves below it.
 *
 * Iterative — a long axon nests deeply enough to overflow the stack.
 */
function measure(roots: MorphoViewerTreeItem[]): Map<MorphoViewerTreeItem, Metrics> {
  const metrics = new Map<MorphoViewerTreeItem, Metrics>();
  const order: { item: MorphoViewerTreeItem; parent?: MorphoViewerTreeItem }[] = [];
  const stack = roots.map((item) => ({
    item,
    parent: undefined as MorphoViewerTreeItem | undefined,
  }));

  while (stack.length) {
    const frame = stack.pop();
    if (!frame) continue;
    order.push(frame);
    for (const child of frame.item.children ?? []) stack.push({ item: child, parent: frame.item });
  }

  for (const { item, parent } of order) {
    // The soma is one point at the origin, so walking its contour must not accumulate path
    // distance — but the stub out of it keeps its length, drawn as the short taper each
    // branch grows from, exactly where it leaves the baseline.
    const isSomaNode = item.type === MorphoViewerTreeItemType.Soma;
    const segmentLength = parent && !isSomaNode ? distance(parent, item) : 0;
    const parentMetrics = parent ? metrics.get(parent) : undefined;
    metrics.set(item, {
      segmentLength,
      distanceFromSoma: (parentMetrics?.distanceFromSoma ?? 0) + segmentLength,
      leavesCount: 0,
      rank: 0,
    });
  }

  // Leaves count upward, so walk the pre-order list backwards: every child is visited before
  // the parent that needs its total.
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const { item, parent } = order[i];
    const own = metrics.get(item);
    if (!own) continue;
    if (!(item.children ?? []).length) own.leavesCount = 1;
    const parentMetrics = parent ? metrics.get(parent) : undefined;
    if (parentMetrics) parentMetrics.leavesCount += own.leavesCount;
  }

  return metrics;
}

/** Split each node's slice of the -1..+1 axis between its children, by their share of leaves. */
function assignRanks(roots: MorphoViewerTreeItem[], metrics: Map<MorphoViewerTreeItem, Metrics>) {
  const fringe = roots.map((item) => ({ item, rankMin: -1, rankMax: 1 }));

  while (fringe.length) {
    const task = fringe.shift();
    if (!task) continue;
    const own = metrics.get(task.item);
    if (!own) continue;

    own.rank = (task.rankMin + task.rankMax) / 2;

    const span = Math.abs(task.rankMax - task.rankMin);
    let rank = task.rankMin;
    for (const child of task.item.children ?? []) {
      const childMetrics = metrics.get(child);
      if (!childMetrics || !own.leavesCount) continue;
      const childSpan = (span * childMetrics.leavesCount) / own.leavesCount;
      fringe.push({ item: child, rankMin: rank, rankMax: rank + childSpan });
      rank += childSpan;
    }
  }
}

/**
 * Lay the tree out as a dendrogram, one placement per node.
 *
 * @param width - Cell bounding-box width; the chart spans it so the morph stays in frame.
 * @param height - Cell bounding-box height, used for the same reason.
 * @returns Placements by node, plus the root leaf count that sets the chart's column pitch.
 */
function computeDendrogramPlacements(
  roots: MorphoViewerTreeItem[],
  width: number,
  height: number
): { placements: Map<MorphoViewerTreeItem, DendrogramPlacement>; leafCount: number } {
  const metrics = measure(roots);
  assignRanks(roots, metrics);

  const placements = new Map<MorphoViewerTreeItem, DendrogramPlacement>();
  const offsetY = height * CENTER_Y;

  for (const [item, own] of metrics) {
    placements.set(item, {
      x: own.rank * width * 0.5,
      // Path distance grows upward from a baseline below centre, as the legacy chart reads.
      top: own.distanceFromSoma - own.segmentLength - offsetY,
      bottom: own.distanceFromSoma - offsetY,
    });
  }

  let leafCount = 0;
  for (const root of roots) leafCount += metrics.get(root)?.leavesCount ?? 0;

  return { placements, leafCount };
}

/** The segment as drawn in the dendrogram: a vertical stroke down its own column. */
function dendrogramSegment(own: DendrogramPlacement): {
  start: ArrayNumber3;
  end: ArrayNumber3;
} {
  return {
    start: [own.x, own.top, 0],
    end: [own.x, own.bottom, 0],
  };
}

/**
 * The right-angle connector from a parent's column across to a child's.
 *
 * Added to both datasets of the morphing pair — degenerate in 3D, horizontal here — so
 * instance counts stay aligned.
 */
function dendrogramLiaison(
  parentX: number,
  own: DendrogramPlacement
): { start: ArrayNumber3; end: ArrayNumber3 } {
  return {
    start: [parentX, own.top, 0],
    end: [own.x, own.top, 0],
  };
}
