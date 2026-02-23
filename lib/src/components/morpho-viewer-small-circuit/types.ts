import type { MorphoViewerTree } from "../morpho-viewer-simul";

export interface MorphoViewerSmallCircuitCell {
	id: string;
	center: [x: number, y: number, z: number];
	orientation: [x: number, y: number, z: number, w: number];
	somaRadius: number;
	color?: string;
}

export type MorphoViewerSmallCircuitCellData = {
	type: "tree";
	data: MorphoViewerTree;
};

export interface MorphoViewerSmallCircuitProps {
	className?: string;
	backgroundColor?: string;
	circuit: MorphoViewerSmallCircuitCell[];
	highlightedCellId?: string;
	onCellHover?(cell: MorphoViewerSmallCircuitCell | undefined): void;
	onCellClick?(cell: MorphoViewerSmallCircuitCell | undefined): void;
	onClose?(): void;
	/**
	 * A function to load a cell.
	 * @param id Unique identifier of the cell from attribute `circuit`.
	 */
	loadCell(id: string): Promise<MorphoViewerSmallCircuitCellData | null>;
}
