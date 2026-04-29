import {
  type ArrayNumber4,
  TgdBoundingBox,
  TgdColor,
  type TgdContext,
  TgdGeometrySphereIco,
  TgdLight,
  type TgdMaterial,
  TgdMaterialDiffuse,
  TgdMaterialFlat,
  TgdMaterialSolid,
  TgdPainterGroup,
  TgdPainterMesh,
  TgdQuat,
  TgdTransfo,
  TgdVec4,
} from "@tolokoban/tgd";

import { int16ToVec3 } from "@/utils";

import { createCellFromTree } from "./factory/tree";

import type { MorphoViewerTree } from "@/components/morpho-viewer-simul";
import type { MorphoViewerSmallCircuitCell, MorphoViewerSmallCircuitCellData } from "../../types";

export interface PainterCellOptions {
  matrerial?: PainterCellMaterialName;
  cell: MorphoViewerSmallCircuitCell;
  loadCell(id: string): Promise<MorphoViewerSmallCircuitCellData | null>;
  /**
   * This callback is called when the morphology of the cell has been loaded.
   * In case of failure, `bbox` will be `null`.
   */
  onCellLoaded?(bbox: TgdBoundingBox | null): void;
}

export type PainterCellMaterialName = "full" | "flat" | number;

export class PainterCell extends TgdPainterGroup {
  private readonly material: TgdMaterial;
  private _black = false;

  constructor(
    private readonly context: TgdContext,
    private readonly options: PainterCellOptions
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
          ambient: new TgdLight({
            color: [0.8, 0.8, 0.8, 0],
          }),
        });
        break;
      case "flat":
        this.material = new TgdMaterialSolid({ color });
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

  // Material color is black?
  get black() {
    return this._black;
  }
  set black(value: boolean) {
    if (this._black === value) return;

    this._black = value;
    const { material } = this;
    if (material instanceof TgdMaterialSolid) {
      material.color = value
        ? new TgdVec4(0, 0, 0, 1)
        : TgdColor.fromString(this.options.cell.color ?? "#f90").toVec4();
    }
  }

  private async loadCell() {
    const { context, material } = this;
    const { cell, loadCell, onCellLoaded } = this.options;

    try {
      const [path] = cell.id.split("?");
      const data = await loadCell(path);
      if (isCellAsTree(data)) {
        const { node, bbox } = createCellFromTree(
          context,
          material,
          data.data,
          typeof this.options.matrerial === "number"
        );
        const [x, y, z] = cell.center;
        const quat = new TgdQuat(cell.orientation);
        node.transfo.setPosition(x, y, z);
        node.transfo.orientation = quat;
        onCellLoaded?.(applyTransfoToBBox(node.transfo, bbox));
        this.removeAll();
        this.add(node);
        context.paint();
      }
    } catch (error) {
      console.error(`Error loading cell "${cell.id}":`, error);
      onCellLoaded?.(null);
    }
  }
}

function isCellAsTree(
  data: MorphoViewerSmallCircuitCellData | null
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

function applyTransfoToBBox(transfo: TgdTransfo, bbox: TgdBoundingBox): TgdBoundingBox | null {
  const { matrix } = transfo;
  const [x0, y0, z0] = bbox.min;
  const [x1, y1, z1] = bbox.max;
  const points: TgdVec4[] = [
    new TgdVec4(x0, y0, z0, 1),
    new TgdVec4(x0, y0, z1, 1),
    new TgdVec4(x0, y1, z0, 1),
    new TgdVec4(x0, y1, z1, 1),
    new TgdVec4(x1, y0, z0, 1),
    new TgdVec4(x1, y0, z1, 1),
    new TgdVec4(x1, y1, z0, 1),
    new TgdVec4(x1, y1, z1, 1),
  ].map((vec) => vec.applyMatrix(matrix));
  const transformedBBox = new TgdBoundingBox();
  for (const [x, y, z] of points) {
    transformedBBox.addPoint(x, y, z);
  }
  return transformedBBox;
}
