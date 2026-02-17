import type { TgdPainterSegmentsData } from "@tolokoban/tgd";
import { CellNodeType } from "@/types";
import type { CellNodes } from "./nodes";
import { Segments } from "./segments";

export function makeData(nodes: CellNodes): TgdPainterSegmentsData {
	const segments = new Segments(nodes);
	nodes.forEach(
		({ index: childIndex, parent: parentIndex, type: childType }) => {
			if (parentIndex < 0) return;

			const parent = nodes.getByIndex(parentIndex);
			if (!parent) return;

			const parentType = parent.type;
			//   if (parentType === CellNodeType.Soma && childType !== CellNodeType.Soma)
			//     return;

			segments.addSegment(childIndex, parentIndex);
		},
	);
	return segments.data;
}
