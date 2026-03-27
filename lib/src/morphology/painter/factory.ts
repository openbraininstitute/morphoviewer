import { CellNodeType } from "@/types";

import { Segments } from "./segments";

import type { TgdPainterSegmentsData } from "@tolokoban/tgd";
import type { CellNodes } from "./nodes";

export function makeData(nodes: CellNodes): {
  neurites: TgdPainterSegmentsData;
  soma: TgdPainterSegmentsData;
} {
  const segmentsNeurites = new Segments(nodes);
  const somaNeurites = new Segments(nodes);
  nodes.forEach(
    ({ index: childIndex, parent: parentIndex, type: childType }) => {
      if (parentIndex < 0) return;

      const parent = nodes.getByIndex(parentIndex);
      if (!parent) return;

      const parentType = parent.type;
      if (parentType === CellNodeType.Soma && childType !== CellNodeType.Soma) {
        somaNeurites.addSegment(childIndex, parentIndex);
      } else {
        segmentsNeurites.addSegment(childIndex, parentIndex);
      }
    },
  );
  return { neurites: segmentsNeurites.data, soma: somaNeurites.data };
}
