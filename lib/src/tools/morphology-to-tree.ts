import { type ArrayNumber3, TgdVec3 } from "@tolokoban/tgd";

import {
  type MorphoViewerTree,
  type MorphoViewerTreeItem,
  MorphoViewerTreeItemType,
} from "@/components/morpho-viewer-simul/types/public";

import { name } from "./../../node_modules/ci-info/index.d";

import type { Morphology } from "@/components/morpho-viewer-simul/types/private";

interface Segment {
  parentKey: string;
  item: MorphoViewerTreeItem;
}

export function morphoViewerConvertMorphologyIntoTree(
  morphology: Morphology,
  cellId: string,
): MorphoViewerTree {
  const tree: MorphoViewerTree = {
    cellId,
    roots: [],
  };
  const segments = new Map<string, Segment>();
  let somaCounts = 0;
  const somaCenter = new TgdVec3();
  const sectionNames = Object.keys(morphology);
  let hasApicalDendrites = false;
  for (const sectionName of sectionNames) {
    const section = morphology[sectionName];
    const type = resolveType(sectionName);
    if (type === MorphoViewerTreeItemType.ApicalDendrite) {
      hasApicalDendrites = true;
    }
    for (let segmentIndex = 0; segmentIndex < section.nseg; segmentIndex++) {
      const start: ArrayNumber3 = [
        section.xstart[segmentIndex],
        section.ystart[segmentIndex],
        section.zstart[segmentIndex],
      ];
      const end: ArrayNumber3 = [
        section.xend[segmentIndex],
        section.yend[segmentIndex],
        section.zend[segmentIndex],
      ];
      const segment: Segment = {
        parentKey: key3D(start),
        item: {
          type,
          x: end[0],
          y: end[1],
          z: end[2],
          radius: section.diam[segmentIndex] / 2,
          sectionId: sectionName,
          segmentId: `${segmentIndex}`,
          distanceFromSoma: 0,
          children: [],
        },
      };
      segments.set(key3D(end), segment);
    }
  }

  for (const { parentKey, item } of segments.values()) {
    const parent = segments.get(parentKey);
    if (parent) {
      if (!parent.item.children) parent.item.children = [];
      parent.item.children.push(item);
    } else {
      console.log("No parent:", item.sectionId, item.segmentId);
      if (item.type === MorphoViewerTreeItemType.Soma) {
        somaCenter.add([item.x, item.y, item.z]);
        somaCounts++;
      }
      tree.roots.push(item);
    }
  }

  if (!hasApicalDendrites) {
    // If no apical dendrite, then we need to display Dendrite instead of BasalDendrite.
    for (const segment of segments.values()) {
      const { item } = segment;
      if (item.type === MorphoViewerTreeItemType.BasalDendrite) {
        item.type = MorphoViewerTreeItemType.Dendrite;
      }
    }
  }
  if (somaCounts > 0) somaCenter.scale(1 / somaCounts);
  return tree;
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

function key3D([x, y, z]: ArrayNumber3) {
  const PRECISION = 3;
  return `${x.toFixed(PRECISION)}/${y.toFixed(PRECISION)}/${z.toFixed(PRECISION)}`;
}
