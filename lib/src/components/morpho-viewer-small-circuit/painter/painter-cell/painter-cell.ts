import {
	type ArrayNumber4,
	TgdColor,
	type TgdContext,
	TgdGeometrySphereIco,
	type TgdMaterial,
	TgdMaterialDiffuse,
	TgdMaterialFlat,
	TgdPainterGroup,
	TgdPainterMesh,
	TgdQuat,
} from "@tolokoban/tgd";
import type { MorphoViewerTree } from "@/components/morpho-viewer-simul";
import { int16ToVec3 } from "@/utils";
import type {
	MorphoViewerSmallCircuitCell,
	MorphoViewerSmallCircuitCellData,
} from "../../types";
import { createCellFromTree } from "./factory/tree";

export interface PainterCellOptions {
	matrerial?: PainterCellMaterialName;
	cell: MorphoViewerSmallCircuitCell;
	loadCell(id: string): Promise<MorphoViewerSmallCircuitCellData | null>;
}

export type PainterCellMaterialName = "full" | "flat" | number;

export class PainterCell extends TgdPainterGroup {
	private readonly material: TgdMaterial;
	private _black = false;

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
		const materialType = options.matrerial ?? "full";
		switch (materialType) {
			case "full":
				this.material = new TgdMaterialDiffuse({
					color,
					lockLightsToCamera: true,
				});
				break;
			case "flat":
				this.material = new TgdMaterialFlat({ color });
				break;
			default:
				this.material = new TgdMaterialFlat({
					color: [...int16ToVec3(materialType), 1],
				});
				break;
		}
		const mesh = new TgdPainterMesh(context, {
			geometry,
			material: this.material,
		});
		this.add(mesh);
		this.loadCell();
	}

	get black() {
		return this._black;
	}
	set black(value: boolean) {
		if (this._black === value) return;

		this._black = value;
		const { material } = this;
		if (material instanceof TgdMaterialFlat) {
			material.color = value ? [0, 0, 0, 1] : this.options.cell.color;
		}
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
