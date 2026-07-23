import {
  TgdBoundingBox,
  TgdColor,
  type TgdContext,
  TgdGeometrySphereIco,
  TgdLight,
  type TgdMaterial,
  TgdMaterialFlat,
  TgdMaterialFlatTexture,
  TgdPainterAxes,
  TgdPainterBBox,
  TgdPainterGroup,
  TgdPainterMesh,
  TgdQuat,
  TgdTexture2D,
  type TgdTransfo,
  TgdVec4,
  tgdCanvasCreatePalette,
} from "@tolokoban/tgd";

import { type MorphoViewerTree, MorphoViewerTreeItemType } from "@/components/morpho-viewer-simul";
import { int16ToVec3 } from "@/utils";

import { createCellFromTree } from "./factory/tree";
import { MaterialDiffuseAlpha } from "./material-diffuse-alpha";

import type {
  MorphoViewerSmallCircuitCell,
  MorphoViewerSmallCircuitCellData,
  SectionColors,
} from "../../types";

export interface PainterCellOptions {
  name?: string;
  matrerial?: PainterCellMaterialName;
  cell: MorphoViewerSmallCircuitCell;
  loadCell(id: string): Promise<MorphoViewerSmallCircuitCellData | null>;
  /**
   * This callback is called when the morphology of the cell has been loaded.
   * In case of failure, `bbox` will be `null`.
   */
  onCellLoaded?(bbox: TgdBoundingBox | null): void;
  /** Neuron mesh opacity in `[0..1]`. Default `1`. */
  opacity?: number;
}

export type PainterCellMaterialName = "full" | "flat" | number;

export class PainterCell extends TgdPainterGroup {
  private static ID = 1;

  private readonly material: TgdMaterial;
  private _black = false;
  private readonly texturePalette: TgdTexture2D;
  private readonly textureBlack: TgdTexture2D;
  private _isDeleted = false;
  private _bbox = new TgdBoundingBox();

  constructor(
    public readonly context: TgdContext,
    protected readonly options: PainterCellOptions
  ) {
    super({
      name:
        options.name ??
        `PainterCell / ${options.cell.id} #${PainterCell.ID++} [${typeof options.matrerial === "number" ? `ID: ${options.matrerial}` : options.matrerial}]`,
    });
    const { cell } = options;
    const [x, y, z] = options.cell.center;
    this.bbox.addSphere(x, y, z, cell.somaRadius * 5);
    const texture = createPaletteTexture(context, cell.color);
    this.texturePalette = texture;
    this.textureBlack = new TgdTexture2D(context).fill("#000");
    const materialType = options.matrerial ?? "full";
    switch (materialType) {
      // What the user will actually see.
      case "full":
        this.material = new MaterialDiffuseAlpha({
          color: texture,
          lockLightsToCamera: true,
          opacity: options.opacity ?? 1,
          ambient: new TgdLight({
            color: [0.8, 0.8, 0.8, 0],
          }),
        });
        break;
      // The highlights for hovering.
      case "flat":
        this.material = new TgdMaterialFlatTexture({ texture });
        break;
      // Offscreen selection IDs.
      default:
        this.material = new TgdMaterialFlat({
          color: [...int16ToVec3(materialType), 1],
        });
        break;
    }
    const geometry = new TgdGeometrySphereIco({
      center: cell.center,
      radius: cell.somaRadius,
      subdivisions: 2,
    });
    const mesh = new TgdPainterMesh(context, {
      name: `IcoSphere / ${options.cell.id}`,
      geometry,
      material: this.material,
    });
    this.add(mesh);
    this.loadCell();
  }

  get bbox(): Readonly<TgdBoundingBox> {
    return this._bbox;
  }

  get isDeleted(): boolean {
    return this._isDeleted || this.context.isDeleted;
  }
  private set isDeleted(isDeleted: boolean) {
    if (this._isDeleted === isDeleted) return;

    this._isDeleted = isDeleted;
  }

  // Material color is black?
  get black() {
    return this._black;
  }
  set black(value: boolean) {
    if (this._black === value) return;

    this._black = value;
    const { material } = this;
    if (material instanceof TgdMaterialFlatTexture) {
      material.texture = value ? this.textureBlack : this.texturePalette;
    }
  }

  get opacity(): number {
    const { material } = this;
    if (material instanceof MaterialDiffuseAlpha) {
      return material.opacity;
    }
    return 1;
  }
  set opacity(opacity: number) {
    const { material } = this;
    if (material instanceof MaterialDiffuseAlpha) {
      material.opacity = opacity;
    }
  }

  paint(time: number, delta: number): void {
    if (this.context.isDeleted) return;

    super.paint(time, delta);
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
        const [sx, sy, sz] = computeSomaCenter(data, node.transfo);
        const transformedBBox = recenterBBox(applyTransfoToBBox(node.transfo, bbox), sx, sy, sz);
        this.removeAll();
        this.add(node);
        if (transformedBBox) {
          this._bbox = transformedBBox;
        }
        if (onCellLoaded) {
          onCellLoaded(transformedBBox);
        }
        context.paint();
      }
    } catch (error) {
      console.error(`Error loading cell "${cell.id}":`, error);
      onCellLoaded?.(null);
    }
  }

  delete(): void {
    this.texturePalette.delete();
    this.textureBlack.delete();
    this.isDeleted = true;
  }
}

function isCellAsTree(
  data: MorphoViewerSmallCircuitCellData | null
): data is { type: "tree"; data: MorphoViewerTree } {
  if (!data || data.type !== "tree") return false;

  return true;
}

function createPaletteTexture(
  context: TgdContext,
  color: MorphoViewerSmallCircuitCell["color"]
): TgdTexture2D {
  const colors = resolveColorsPerSection(color);
  const canvas = tgdCanvasCreatePalette([
    colors.soma,
    colors.axon,
    colors.basalDendrite,
    colors.apicalDendrite,
    colors.myelin,
    colors.unknown,
  ]);
  const texture = new TgdTexture2D(context, {
    params: {
      minFilter: "NEAREST",
      magFilter: "NEAREST",
    },
  }).loadBitmap(canvas);
  return texture;
}

function resolveColorsPerSection(color: MorphoViewerSmallCircuitCell["color"]): SectionColors {
  if (!color) {
    const randomColor = TgdColor.fromHSL(Math.random(), 0.8, 0.5).toString();
    return {
      apicalDendrite: randomColor,
      axon: randomColor,
      basalDendrite: randomColor,
      myelin: randomColor,
      soma: randomColor,
      unknown: randomColor,
    };
  }
  if (typeof color === "string") {
    return {
      apicalDendrite: color,
      axon: color,
      basalDendrite: color,
      myelin: color,
      soma: color,
      unknown: color,
    };
  }
  return color;
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

function recenterBBox(bbox: TgdBoundingBox | null, x: number, y: number, z: number) {
  if (!bbox) return null;

  const sizeX = Math.max(Math.abs(x - bbox.min[0]), Math.abs(x - bbox.max[0]));
  const sizeY = Math.max(Math.abs(y - bbox.min[1]), Math.abs(y - bbox.max[1]));
  const sizeZ = Math.max(Math.abs(z - bbox.min[2]), Math.abs(z - bbox.max[2]));
  bbox.addPoint(x - sizeX, y - sizeY, z - sizeZ);
  bbox.addPoint(x + sizeX, y + sizeY, z + sizeZ);
  return bbox;
}

function computeSomaCenter(data: MorphoViewerSmallCircuitCellData, transfo?: TgdTransfo) {
  let count = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  const fringe = [...data.data.roots];
  while (fringe.length > 0) {
    const item = fringe.pop();
    if (!item) break;

    if (item.type !== MorphoViewerTreeItemType.Soma) continue;

    x += item.x;
    y += item.y;
    z += item.z;
    count++;
    if (item.children) fringe.push(...item.children);
  }
  if (count === 0) return [0, 0, 0];

  const center = new TgdVec4(x, y, z, 0).scale(1 / count);
  center.w = 1;
  if (transfo) {
    center.applyMatrix(transfo.matrix);
  }
  return center;
}
