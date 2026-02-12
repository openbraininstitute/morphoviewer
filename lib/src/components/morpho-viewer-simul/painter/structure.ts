import { type ArrayNumber3, TgdBoundingBox, TgdVec3 } from "@tolokoban/tgd";

import {
  MorphoViewerTree,
  MorphoViewerTreeItem,
  MorphoViewerTreeItemType,
} from "../types/public";
import { builTree, debugTree } from "./tree";

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
  length: number;
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

  public readonly bbox = new TgdBoundingBox();

  /**
   * Bounding box of the axon
   */
  public readonly bboxSoma = new TgdBoundingBox();

  /**
   * Bounding box of the dendrites only (no axon nor myelin)
   */
  public readonly bboxDendrites = new TgdBoundingBox();

  private readonly items: StructureItem[] = [];

  private readonly segments = new Map<string, StructureItem>();

  private readonly segmentsPerSection = new Map<string, StructureItem[]>();

  private readonly segmentsCountPerSection = new Map<string, number>();

  private _hasApicalDendrites: boolean = false;

  constructor(morphology: MorphoViewerTree) {
    this.cellId = morphology.cellId;
    for (const root of morphology.roots) {
      this.registerBranch(null, root);
    }
    for (const item of this.items) {
      item.segmentsCount =
        this.segmentsCountPerSection.get(item.sectionName) ?? 0;
    }
    this.root = builTree(this.items);
  }

  get hasApicalDendrites() {
    return this._hasApicalDendrites;
  }

  private registerBranch(
    parent: MorphoViewerTreeItem | null,
    node: MorphoViewerTreeItem,
  ) {
    if (parent) {
      if (node.type === MorphoViewerTreeItemType.ApicalDendrite) {
        this._hasApicalDendrites = true;
      }
      const item: StructureItem = {
        children: [],
        index: this.items.length,
        distanceFromSoma: 0,
        length: 0,
        name: `${resolveTypeName(node.type)}[${node.sectionId}][${node.segmentId}]`,
        sectionName: node.sectionId,
        sectionIndex: parseInt(node.sectionId, 10),
        segmentIndex: parseInt(node.segmentId, 10),
        segmentsCount: 0,
        start: [parent.x, parent.y, parent.z],
        end: [node.x, node.y, node.z],
        radiusStart: parent.radius,
        radiusEnd: node.radius,
        type: node.type,
        leavesCount: 0,
        maxLength: 0,
        rank: 0,
        node,
      };
      this.items.push(item);
      this.segmentsCountPerSection.set(
        node.sectionId,
        this.segmentsCountPerSection.get(node.sectionId) ?? 0 + 1,
      );
    }
    for (const child of node.children ?? []) {
      this.registerBranch(node, child);
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

  private addToSection(item: StructureItem) {
    const sectionFromMap = this.segmentsPerSection.get(item.sectionName);
    if (sectionFromMap) {
      sectionFromMap.push(item);
      sectionFromMap.sort(({ segmentIndex: a }, { segmentIndex: b }) => a - b);
    } else {
      this.segmentsPerSection.set(item.sectionName, [item]);
    }
  }
}

function computeMin(
  prev: ArrayNumber3,
  curr: ArrayNumber3,
  radius = 0,
): ArrayNumber3 {
  return [
    Math.min(prev[0], curr[0] - radius),
    Math.min(prev[1], curr[1] - radius),
    Math.min(prev[2], curr[2] - radius),
  ];
}

function computeMax(
  prev: ArrayNumber3,
  curr: ArrayNumber3,
  radius = 0,
): ArrayNumber3 {
  return [
    Math.max(prev[0], curr[0] + radius),
    Math.max(prev[1], curr[1] + radius),
    Math.max(prev[2], curr[2] + radius),
  ];
}

function resolveType(sectionName: string): MorphoViewerTreeItemType {
  const prefix = sectionName.slice(0, 4).toLowerCase();
  switch (prefix) {
    case "soma":
      return MorphoViewerTreeItemType.Soma;
    case "axon":
      return MorphoViewerTreeItemType.Axon;
    case "dend":
      return MorphoViewerTreeItemType.BasalDendrite;
    case "apic":
      return MorphoViewerTreeItemType.ApicalDendrite;
    case "myel":
      return MorphoViewerTreeItemType.Myelin;
    default:
      return MorphoViewerTreeItemType.Unknown;
  }
}

/**
 * The section index is at the end of the name, surrounded by square brackets.
 *
 * Example: `dend[32]`
 */
function resolveSectionIndex(sectionName: string): number {
  const i = sectionName.indexOf("[");
  const suffix = sectionName.slice(i + 1);
  return parseInt(suffix.slice(0, suffix.length - 1), 10);
}

function createInitialBBox(): StructureBoundingBox {
  return {
    min: [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ],
    max: [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ],
    center: [0, 0, 0],
  };
}

function copyBBoxInto(from: StructureBoundingBox, to: StructureBoundingBox) {
  to.center = [...from.center];
  to.max = [...from.max];
  to.min = [...from.min];
}

function resolveTypeName(type: MorphoViewerTreeItemType) {
  switch (type) {
    case MorphoViewerTreeItemType.Soma:
      return "soma";
    case MorphoViewerTreeItemType.Axon:
      return "axon";
    case MorphoViewerTreeItemType.Dendrite:
      return "dend";
    case MorphoViewerTreeItemType.ApicalDendrite:
      return "dend";
    case MorphoViewerTreeItemType.BasalDendrite:
      return "dend";
    case MorphoViewerTreeItemType.Myelin:
      return "myel";
    default:
      return "unknown";
  }
}
