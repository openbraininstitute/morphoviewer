import { type ArrayNumber2, type ArrayNumber3, TgdPainterSegmentsData } from "@tolokoban/tgd";

import { MorphoViewerTreeItemType } from "../types/public";

import type { Structure, StructureItem } from "./structure";

const HIGHLIGHT_RADIUS_MULTIPLIER = 1.5;

export function makeSegments3D(structure: Structure, map: Map<number, TgdPainterSegmentsData>) {
  const segments = new TgdPainterSegmentsData();
  structure.forEach((item) => {
    const { start, end } = item;
    processSegment(item, structure, segments, start, end, map);
  });
  return segments;
}

export function makeSegmentsDendrogram(
  structure: Structure,
  map: Map<number, TgdPainterSegmentsData>,
) {
  const width = Math.abs(structure.bboxDendrites.max[0] - structure.bboxDendrites.min[0]);
  const height = Math.abs(structure.bboxDendrites.max[1] - structure.bboxDendrites.min[1]);
  const segments = new TgdPainterSegmentsData();
  structure.forEach((item) => {
    const start = computeDendrogramStart(item, width, height);
    const end = computeDendrogramEnd(item, width, height);
    processSegment(item, structure, segments, start, end, map);
  });
  return segments;
}

function processSegment(
  item: StructureItem,
  structure: Structure,
  segments: TgdPainterSegmentsData,
  start: ArrayNumber3,
  end: ArrayNumber3,
  map: Map<number, TgdPainterSegmentsData>,
) {
  const uv: ArrayNumber2 = [
    (item.type + 0.5) / (MorphoViewerTreeItemType.Unknown + 1),
    (item.index + 1.5) / (structure.length + 2),
  ];
  segments.add(
    [...start, structure.useStraightCylinders ? item.radiusEnd : item.radiusStart],
    [...end, item.radiusEnd],
    uv,
    uv,
  );
  /**
   * Singletons are used to paint highlights.
   */
  const singleton = new TgdPainterSegmentsData();
  const radiusStart = item.radiusStart * HIGHLIGHT_RADIUS_MULTIPLIER;
  const radiusEnd = item.radiusEnd * HIGHLIGHT_RADIUS_MULTIPLIER;
  singleton.add([...start, radiusStart], [...end, radiusEnd], uv, uv);
  if (item.type !== MorphoViewerTreeItemType.Liaison) {
    map.set(item.index, singleton);
  }
}

const DENDROGRAM_CENTER_Y = 0.4;

function computeDendrogramStart(item: StructureItem, width: number, height: number): ArrayNumber3 {
  if (item.type === MorphoViewerTreeItemType.Liaison) {
    return computeDendrogramEnd(item.parent ?? item, width, height);
  }
  const x = item.rank * width;
  const y = item.distanceFromSoma - height * DENDROGRAM_CENTER_Y;
  const z = 0;
  return [x, y, z];
}

function computeDendrogramEnd(item: StructureItem, width: number, height: number): ArrayNumber3 {
  if (item.type === MorphoViewerTreeItemType.Liaison) {
    const [child] = item.children;
    return computeDendrogramStart(child ?? item, width, height);
  }
  const x = item.rank * width;
  const y = item.distanceFromSoma + item.segmentLength - height * DENDROGRAM_CENTER_Y;
  const z = 0;
  return [x, y, z];
}
