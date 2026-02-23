import {
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
): TgdPainterNode {
	const segmentsSoma = new TgdPainterSegmentsData();
	const segmentsNeurites = new TgdPainterSegmentsData();
	for (const item of tree.roots) {
		fillSegments(undefined, item, segmentsSoma, segmentsNeurites);
	}
	return new TgdPainterNode({
		children: [
			new TgdPainterSegments(context, {
				roundness: 24,
				material,
				dataset: segmentsSoma.makeDataset(),
			}),
			new TgdPainterSegments(context, {
				roundness: 5,
				material,
				dataset: segmentsNeurites.makeDataset(),
			}),
		],
	});
}

function fillSegments(
	parent: MorphoViewerTreeItem | undefined,
	item: MorphoViewerTreeItem,
	segmentsSoma: TgdPainterSegmentsData,
	segmentsNeurites: TgdPainterSegmentsData,
) {
	if (!parent) {
		segmentsSoma.add(
			[item.x, item.y, item.z, item.radius],
			[item.x, item.y, item.z, item.radius],
		);
	} else if (item.type === MorphoViewerTreeItemType.Soma) {
		segmentsSoma.add(
			[parent.x, parent.y, parent.z, parent.radius],
			[item.x, item.y, item.z, item.radius],
		);
	} else {
		segmentsNeurites.add(
			[parent.x, parent.y, parent.z, parent.radius],
			[item.x, item.y, item.z, item.radius],
		);
	}
	for (const child of item.children ?? []) {
		fillSegments(item, child, segmentsSoma, segmentsNeurites);
	}
}
