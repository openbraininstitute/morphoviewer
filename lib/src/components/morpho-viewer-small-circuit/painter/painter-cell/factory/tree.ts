import {
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

export function createCellFromTree(
  context: TgdContext,
  material: TgdMaterial,
  tree: MorphoViewerTree,
  forSelection: boolean
): { bbox: TgdBoundingBox; node: TgdPainterNode } {
  const segmentsSoma = new TgdPainterSegmentsData();
  const segmentsNeurites = new TgdPainterSegmentsData();
  for (const item of tree.roots) {
    fillSegments(undefined, item, segmentsSoma, segmentsNeurites);
  }
  const bbox = new TgdBoundingBox();
  for (const segments of [segmentsSoma, segmentsNeurites]) {
    for (let i = 0; i < segments.count; i++) {
      const [x0, y0, z0, r0] = segmentsNeurites.getXYZR0(i);
      bbox.addSphere(x0, y0, z0, r0 * 2);
      const [x1, y1, z1, r1] = segmentsNeurites.getXYZR1(i);
      bbox.addSphere(x1, y1, z1, r1 * 2);
    }
  }
  return {
    bbox,
    node: new TgdPainterNode({
      children: [
        new TgdPainterSegments(context, {
          roundness: forSelection ? 5 : 12,
          radiusMultiplier: forSelection ? 1.1 : 1,
          material,
          dataset: segmentsSoma.makeDataset(),
        }),
        new TgdPainterSegments(context, {
          roundness: forSelection ? 3 : 5,
          minRadius: 2,
          radiusMultiplier: forSelection ? 1.6 : 1,
          material,
          dataset: segmentsNeurites.makeDataset(),
        }),
      ],
    }),
  };
}

function fillSegments(
  parent: MorphoViewerTreeItem | undefined,
  item: MorphoViewerTreeItem,
  segmentsSoma: TgdPainterSegmentsData,
  segmentsNeurites: TgdPainterSegmentsData
) {
  if (!parent) {
    segmentsSoma.add([item.x, item.y, item.z, item.radius], [item.x, item.y, item.z, item.radius]);
  } else if (item.type === MorphoViewerTreeItemType.Soma) {
    segmentsSoma.add(
      [parent.x, parent.y, parent.z, parent.radius],
      [item.x, item.y, item.z, item.radius]
    );
  } else {
    segmentsNeurites.add(
      [parent.x, parent.y, parent.z, parent.radius],
      [item.x, item.y, item.z, item.radius]
    );
  }
  for (const child of item.children ?? []) {
    fillSegments(item, child, segmentsSoma, segmentsNeurites);
  }
}
