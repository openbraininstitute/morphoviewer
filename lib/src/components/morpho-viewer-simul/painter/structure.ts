import {
	type ArrayNumber3,
	TgdBoundingBox,
	TgdVec3,
} from "@tolokoban/tgd";

import {
	type MorphoViewerTree,
	type MorphoViewerTreeItem,
	MorphoViewerTreeItemType,
} from "../types/public";
import { resolveTypeName } from "../utils";
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
	private somaCenter = new TgdVec3();
	private somaCount = 0;
	private readonly items: StructureItem[] = [];
	private readonly segments = new Map<string, StructureItem>();
	private readonly segmentsPerSection = new Map<string, StructureItem[]>();
	private readonly segmentsCountPerSection = new Map<string, number>();
	private _hasApicalDendrites: boolean = false;

	constructor(morphology: MorphoViewerTree) {
		this.cellId = morphology.cellId;
		const soma = morphology.roots.find(
			(item) => item.type === MorphoViewerTreeItemType.Soma,
		);
		const center: ArrayNumber3 = soma ? [soma.x, soma.y, soma.z] : [0, 0, 0];
		for (const root of morphology.roots) {
			const distanceFromSoma =
				root.type === MorphoViewerTreeItemType.Soma
					? 0
					: computeDistance(center, [root.x, root.y, root.z]);
			this.registerBranch(null, root, distanceFromSoma);
		}
		if (this.somaCount > 0) {
			this.somaCenter.scale(1 / this.somaCount);
			this.center = [this.somaCenter.x, this.somaCenter.y, this.somaCenter.z];
		} else {
			this.center = [...this.bboxDendrites.center];
		}
		this.zoomMin = Math.min(
			0.75,
			computeZoomByDividingBBoxes(this.bboxDendrites, this.bbox),
		);
		this.zoomMax = Math.max(
			1.33,
			computeZoomByDividingBBoxes(this.bboxDendrites, this.bboxSoma),
		);
		for (const item of this.items) {
			this.addToSection(item);
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
				this.somaCenter.add([node.x, node.y, node.z]);
				this.somaCount++;
			}
		}
		if (parent) {
			if (node.type === MorphoViewerTreeItemType.ApicalDendrite) {
				this._hasApicalDendrites = true;
			}
			const item: StructureItem = {
				children: [],
				index: this.items.length,
				distanceFromSoma,
				length: computeDistance(
					[parent.x, parent.y, parent.z],
					[node.x, node.y, node.z],
				),
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
	[x1, y1, z1]: ArrayNumber3,
	[x2, y2, z2]: ArrayNumber3,
) {
	return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2);
}