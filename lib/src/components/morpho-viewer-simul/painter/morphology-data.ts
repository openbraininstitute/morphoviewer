import { makeSegments3D, makeSegmentsDendrogram } from "./segments";
import { Structure } from "./structure";

import type { TgdDataset, TgdPainterSegmentsData } from "@tolokoban/tgd";
import type { MorphoViewerTree, MorphoViewerTreeItem } from "../types/public";

export class MorphologyData {
  public readonly structure: Structure;

  public readonly dataset3D: TgdDataset;

  public readonly segments3D = new Map<number, TgdPainterSegmentsData>();

  public readonly datasetDendrogram: TgdDataset;

  public readonly segmentsDendrogram = new Map<
    number,
    TgdPainterSegmentsData
  >();

  constructor(morphology: MorphoViewerTree) {
    fixLoopsInTree(morphology);
    this.structure = new Structure(morphology);
    const segments3D = makeSegments3D(this.structure, this.segments3D);
    this.dataset3D = segments3D.makeDataset();
    const segmentsDendrogram = makeSegmentsDendrogram(
      this.structure,
      this.segmentsDendrogram,
    );
    this.datasetDendrogram = segmentsDendrogram.makeDataset();
  }
}

function fixLoopsInTree(tree: MorphoViewerTree) {
  const parents = new Set<string>();
  const fringe = tree.roots.slice();
  while (fringe.length > 0) {
    const item = fringe.shift();
    if (!item) continue;

    parents.add(makeId(item));
    const fixedChildren: MorphoViewerTreeItem[] = [];
    for (const child of item.children ?? []) {
      if (parents.has(makeId(child))) {
        console.error("Cycle!  ", makeId(item), "->", makeId(child));
      } else {
        fixedChildren.push(child);
        fringe.push(child);
      }
    }
    item.children = fixedChildren;
  }
}

function makeId(item: MorphoViewerTreeItem) {
  return `${item.sectionId}/${item.segmentId}`;
}
