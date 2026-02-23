import {
	type ArrayNumber4,
	TgdColor,
	type TgdContext,
	TgdGeometrySphereIco,
	type TgdMaterial,
	TgdMaterialDiffuse,
	TgdPainterGroup,
	TgdPainterMesh,
	TgdQuat,
} from "@tolokoban/tgd";
import type { MorphoViewerTree } from "@/components/morpho-viewer-simul";
import type {
	MorphoViewerSmallCircuitCell,
	MorphoViewerSmallCircuitCellData,
} from "../../types";
import { createCellFromTree } from "./factory/tree";

export interface PainterCellOptions {
	cell: MorphoViewerSmallCircuitCell;
	loadCell(id: string): Promise<MorphoViewerSmallCircuitCellData | null>;
}

export class PainterCell extends TgdPainterGroup {
	private readonly material: TgdMaterial;

	constructor(
		private readonly context: TgdContext,
		private readonly options: PainterCellOptions,
	) {
		super({
			name: `Cell/${options.cell.id}`,
		});
		const { cell } = options;
		const geometry = new TgdGeometrySphereIco({
			center: cell.center,
			radius: cell.somaRadius,
			subdivisions: 2,
		});
		const color = ensureCellHasColor(cell);
		console.log("🐞 [painter-cell@32] color =", color); // @FIXME: Remove this line written on 2026-02-23 at 14:42
		const material = (this.material = new TgdMaterialDiffuse({
			color,
			lockLightsToCamera: true,
		}));
		const mesh = new TgdPainterMesh(context, { geometry, material });
		this.add(mesh);
		void this.loadCell();
	}

	private async loadCell() {
		const { context, material } = this;
		const { cell, loadCell } = this.options;
		try {
			const data = await loadCell(cell.id);
			console.log("🐞 [painter-cell@55] data =", data); // @FIXME: Remove this line written on 2026-02-23 at 15:55
			if (isCellAsTree(data)) {
				const mesh = createCellFromTree(context, material, data.data);
				const [x, y, z] = cell.center;
				const quat = new TgdQuat(cell.orientation);
				mesh.transfo.setPosition(x, y, z);
				mesh.transfo.orientation = quat;
				this.removeAll();
				this.add(mesh);
				context.paint();
			}
		} catch (error) {
			console.error(`Error loading cell "${cell.id}":`, error);
		}
	}
}

function isCellAsTree(
	data: MorphoViewerSmallCircuitCellData | null,
): data is { type: "tree"; data: MorphoViewerTree } {
	if (!data || data.type !== "tree") return false;

	return true;
}

function ensureCellHasColor(cell: MorphoViewerSmallCircuitCell): ArrayNumber4 {
	const color = new TgdColor(Math.random(), Math.random(), Math.random(), 1);
	color.rgb2hsl();
	color.L = 0.5;
	color.hsl2rgb();
	if (cell.color) {
		color.parse(cell.color);
	} else {
		cell.color = color.toString();
	}
	return [color.R, color.G, color.B, color.A];
}
