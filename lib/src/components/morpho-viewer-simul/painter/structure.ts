import {
  type ArrayNumber3,
  TgdBoundingBox,
  type TgdVec3,
} from "@tolokoban/tgd";

import {
  type MorphoViewerTree,
  type MorphoViewerTreeItem,
  MorphoViewerTreeItemType,
} from "../types/public";
import { resolveSectionIndex } from "../utils";
import { findSoma, parentOrphansToSoma } from "./soma";
import { addLiaisons, computeRanks, debugTree, populateTree } from "./tree";

export interface StructureItem {
  parent?: StructureItem;
  children: StructureItem[];
  index: number;
  name: string;
  sectionName: string;
  sectionIndex: number;
  segmentIndex: number;
  segmentsCount: number;
  start: ArrayNumber3;
  end: ArrayNumber3;
  radiusStart: number;
  radiusEnd: number;
  type: MorphoViewerTreeItemType;
  segmentLength: number;
  sectionLength: number;
  distanceFromSoma: number;
  leavesCount: number;
  maxLength: number;
  /**
   * Value between -1.0 and +1.0
   *
   * Used for dendrograms.
   */
  rank: number;
  node: MorphoViewerTreeItem;
}

export interface StructureBoundingBox {
  min: ArrayNumber3;
  max: ArrayNumber3;
  center: ArrayNumber3;
}

export class Structure {
  public readonly cellId: string;
  public readonly root: StructureItem;
  /**
   * Bounding box of the dendrites only (no axon nor myelin).
   * That's what we want to focus at zoom 1.
   */
  public readonly bboxDendrites = new TgdBoundingBox();
  public readonly zoomMin: number;
  public readonly zoomMax: number;
  public readonly center: Readonly<ArrayNumber3>;

  private readonly bbox = new TgdBoundingBox();
  /**
   * Bounding box of the Soma
   */
  private readonly bboxSoma = new TgdBoundingBox();
  private readonly items: StructureItem[] = [];
  private readonly segmentsPerSection = new Map<string, StructureItem[]>();
  private _hasApicalDendrites: boolean = false;

  constructor(morphology: MorphoViewerTree) {
    this.cellId = morphology.cellId;
    const { somaTreeItem } = findSoma(morphology);
    const treeRoot = parentOrphansToSoma(morphology, somaTreeItem);
    if (!treeRoot) throw new Error("No root found in morphology!");

    this.computeDistancesFromSoma(treeRoot);
    const root: StructureItem = this.createAllSegments(treeRoot);
    this.root = root;
    this.center = [
      treeRoot.x,
      treeRoot.y,
      treeRoot.z,
    ] as Readonly<ArrayNumber3>;
    this.zoomMin = Math.min(
      0.75,
      computeZoomByDividingBBoxes(this.bboxDendrites, this.bbox),
    );
    this.zoomMax = Math.max(
      1.33,
      computeZoomByDividingBBoxes(this.bboxDendrites, this.bboxSoma),
    );
    this.computeSectionsLengths();
    populateTree(root);
    computeRanks(root);
    addLiaisons(root, this.items);
  }

  private computeSectionsLengths() {
    for (const segments of this.segmentsPerSection.values()) {
      const sectionLength = segments.reduce(
        (length, segment) => length + segment.segmentLength,
        0,
      );
      for (const segment of segments) {
        segment.sectionLength = sectionLength;
      }
    }
  }

  private createAllSegments(
    node: MorphoViewerTreeItem,
    parent?: MorphoViewerTreeItem,
  ): StructureItem {
    const segment = this.createSegment(parent ?? node, node);
    for (const child of node.children ?? []) {
      const childSegment = this.createAllSegments(child, node);
      childSegment.parent = segment;
      segment.children.push(childSegment);
    }
    return segment;
  }

  private computeDistancesFromSoma(singleRoot: MorphoViewerTreeItem) {
    singleRoot.distanceFromSoma = 0;
    this.registerBranch(null, singleRoot, 0);
  }

  get hasApicalDendrites() {
    return this._hasApicalDendrites;
  }

  private registerBranch(
    parent: MorphoViewerTreeItem | null,
    node: MorphoViewerTreeItem,
    distanceFromSoma: number,
  ) {
    node.distanceFromSoma = distanceFromSoma;
    const { type } = node;
    if (
      [
        MorphoViewerTreeItemType.Soma,
        MorphoViewerTreeItemType.Dendrite,
        MorphoViewerTreeItemType.ApicalDendrite,
        MorphoViewerTreeItemType.BasalDendrite,
      ].includes(type)
    ) {
      this.bboxDendrites.addSphere(node.x, node.y, node.z, node.radius);
      if (type === MorphoViewerTreeItemType.Soma) {
        this.bboxSoma.addSphere(node.x, node.y, node.z, node.radius);
      }
    }
    if (parent) {
      if (node.type === MorphoViewerTreeItemType.ApicalDendrite) {
        this._hasApicalDendrites = true;
      }
    }
    for (const child of node.children ?? []) {
      this.registerBranch(
        node,
        child,
        distanceFromSoma +
          (parent
            ? computeDistance(
                [parent.x, parent.y, parent.z],
                [node.x, node.y, node.z],
              )
            : 0),
      );
    }
  }

  getSegmentsOfSection(sectionName: string): StructureItem[] {
    return this.segmentsPerSection.get(sectionName) ?? [];
  }

  get length() {
    return this.items.length;
  }

  get(index: number): StructureItem {
    const item = this.items[index];
    if (!item)
      throw Error(
        `Index (${index}) out of bounds! Items available: ${this.length}.`,
      );

    return item;
  }

  forEach(callback: (item: StructureItem, index: number) => void) {
    this.items.forEach(callback);
  }

  private createSegment(
    parent: MorphoViewerTreeItem,
    node: MorphoViewerTreeItem,
  ) {
    const index = this.items.length;
    const item: StructureItem = {
      children: [],
      index,
      distanceFromSoma: node.distanceFromSoma,
      segmentLength: computeDistance(
        [parent.x, parent.y, parent.z],
        [node.x, node.y, node.z],
      ),
      sectionLength: 0,
      name: `${node.sectionId}[${node.segmentId}]`,
      sectionName: node.sectionId,
      sectionIndex: resolveSectionIndex(node.sectionId),
      segmentIndex: parseInt(node.segmentId, 10),
      segmentsCount: 1,
      start: [parent.x, parent.y, parent.z],
      end: [node.x, node.y, node.z],
      radiusStart: adjustParentRadius(parent, node),
      radiusEnd: node.radius,
      type: node.type,
      leavesCount: 0,
      maxLength: 0,
      rank: 0,
      node,
    };
    this.items.push(item);
    const segments = this.segmentsPerSection.get(node.sectionId) ?? [];
    segments.push(item);
    this.segmentsPerSection.set(node.sectionId, segments);
    for (const segment of segments) {
      segment.segmentsCount = segments.length;
    }
    return item;
  }
}

function computeZoomByDividingBBoxes(
  bbox1: TgdBoundingBox,
  bbox2: TgdBoundingBox,
): number {
  const width1 = bbox1.max[0] - bbox1.min[0];
  const height1 = bbox1.max[1] - bbox1.min[1];
  const width2 = bbox2.max[0] - bbox2.min[0];
  const height2 = bbox2.max[1] - bbox2.min[1];
  return Math.min(width1 / width2, height1 / height2);
}

function computeDistance(
  [x1, y1, z1]: ArrayNumber3 | TgdVec3,
  [x2, y2, z2]: ArrayNumber3,
) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2);
}

/**
 * We want to adjust the start radius of dendrites directly
 * attached to soma.
 * It should be half of the radius of the soma.
 */
function adjustParentRadius(
  parent: MorphoViewerTreeItem,
  node: MorphoViewerTreeItem,
): number {
  if (
    parent.type !== MorphoViewerTreeItemType.Soma ||
    node.type === MorphoViewerTreeItemType.Soma
  ) {
    return parent.radius;
  }
  return Math.max(parent.radius * 0.5, node.radius);
}
