import {
    TgdBoundingBox,
    TgdColor,
    type TgdContext,
    TgdGeometrySphereIco,
    TgdLight,
    type TgdMaterial,
    TgdMaterialDiffuse,
    TgdMaterialFlat,
    TgdMaterialFlatTexture,
    TgdPainterGroup,
    TgdPainterMesh,
    TgdQuat,
    TgdTexture2D,
    type TgdTransfo,
    TgdVec4,
    tgdCanvasCreateFill,
    tgdCanvasCreatePalette,
} from "@tolokoban/tgd"
import type { MorphoViewerTree } from "@/components/morpho-viewer-simul"
import { int16ToVec3 } from "@/utils"
import type { MorphoViewerSmallCircuitCell, MorphoViewerSmallCircuitCellData, SectionColors } from "../../types"
import { createCellFromTree } from "./factory/tree"

export interface PainterCellOptions {
    matrerial?: PainterCellMaterialName
    cell: MorphoViewerSmallCircuitCell
    loadCell(id: string): Promise<MorphoViewerSmallCircuitCellData | null>
    /**
     * This callback is called when the morphology of the cell has been loaded.
     * In case of failure, `bbox` will be `null`.
     */
    onCellLoaded?(bbox: TgdBoundingBox | null): void
}

export type PainterCellMaterialName = "full" | "flat" | number

export class PainterCell extends TgdPainterGroup {
    private readonly material: TgdMaterial
    private _black = false;
    private readonly texturePalette: TgdTexture2D
    private readonly textureBlack: TgdTexture2D

    constructor(
        private readonly context: TgdContext,
        private readonly options: PainterCellOptions
    ) {
        super({
            name: `PainterCell / ${options.cell.id}`,
        })
        const { cell } = options
        const texture = createPaletteTexture(context, cell.color)
        this.texturePalette = texture
        this.textureBlack = new TgdTexture2D(context).loadBitmap(tgdCanvasCreateFill(1, 1, "#000"))
        const materialType = options.matrerial ?? "full"
        switch (materialType) {
            case "full":
                this.material = new TgdMaterialDiffuse({
                    color: texture,
                    lockLightsToCamera: true,
                    ambient: new TgdLight({
                        color: [0.8, 0.8, 0.8, 0],
                    }),
                })
                break
            case "flat":
                this.material = new TgdMaterialFlatTexture({ texture })
                break
            default:
                this.material = new TgdMaterialFlat({
                    color: [...int16ToVec3(materialType), 1],
                })
                break
        }
        const geometry = new TgdGeometrySphereIco({
            center: cell.center,
            radius: cell.somaRadius,
            subdivisions: 2,
        })
        const mesh = new TgdPainterMesh(context, {
            name: `Soma / ${options.cell.id}`,
            geometry,
            material: this.material,
        })
        this.add(mesh)
        this.loadCell()
    }

    // Material color is black?
    get black() {
        return this._black
    }
    set black(value: boolean) {
        if (this._black === value) return

        this._black = value
        const { material } = this
        if (material instanceof TgdMaterialFlatTexture) {
            material.texture = value
                ? this.textureBlack
                : this.texturePalette
        }
    }

    private async loadCell() {
        const { context, material } = this
        const { cell, loadCell, onCellLoaded } = this.options

        try {
            const [path] = cell.id.split("?")
            const data = await loadCell(path)
            if (isCellAsTree(data)) {
                const { node, bbox } = createCellFromTree(
                    context,
                    material,
                    data.data,
                    typeof this.options.matrerial === "number"
                )
                const [x, y, z] = cell.center
                const quat = new TgdQuat(cell.orientation)
                node.transfo.setPosition(x, y, z)
                node.transfo.orientation = quat
                onCellLoaded?.(applyTransfoToBBox(node.transfo, bbox))
                this.removeAll()
                this.add(node)
                context.paint()
            }
        } catch (error) {
            console.error(`Error loading cell "${cell.id}":`, error)
            onCellLoaded?.(null)
        }
    }

    delete(): void {
        this.texturePalette.delete()
        this.textureBlack.delete()
    }
}

function isCellAsTree(
    data: MorphoViewerSmallCircuitCellData | null
): data is { type: "tree"; data: MorphoViewerTree } {
    if (!data || data.type !== "tree") return false

    return true
}

function createPaletteTexture(context: TgdContext, color: MorphoViewerSmallCircuitCell["color"]): TgdTexture2D {
    const colors = resolveColorsPerSection(color)
    const canvas = tgdCanvasCreatePalette([
        colors.soma,
        colors.axon,
        colors.basalDendrite,
        colors.apicalDendrite,
        colors.myelin,
        colors.unknown
    ])
    const texture = new TgdTexture2D(context, {
        params: {
            minFilter: "NEAREST",
            magFilter: "NEAREST"
        }
    }).loadBitmap(canvas)
    return texture
}

function resolveColorsPerSection(color: MorphoViewerSmallCircuitCell["color"]): SectionColors {
    if (!color) {
        const randomColor = TgdColor.fromHSL(Math.random(), .8, 0.5).toString()
        return {
            apicalDendrite: randomColor,
            axon: randomColor,
            basalDendrite: randomColor,
            myelin: randomColor,
            soma: randomColor,
            unknown: randomColor,
        }
    }
    if (typeof color === "string") {
        return {
            apicalDendrite: color,
            axon: color,
            basalDendrite: color,
            myelin: color,
            soma: color,
            unknown: color,
        }
    }
    return color
}

function applyTransfoToBBox(transfo: TgdTransfo, bbox: TgdBoundingBox): TgdBoundingBox | null {
    const { matrix } = transfo
    const [x0, y0, z0] = bbox.min
    const [x1, y1, z1] = bbox.max
    const points: TgdVec4[] = [
        new TgdVec4(x0, y0, z0, 1),
        new TgdVec4(x0, y0, z1, 1),
        new TgdVec4(x0, y1, z0, 1),
        new TgdVec4(x0, y1, z1, 1),
        new TgdVec4(x1, y0, z0, 1),
        new TgdVec4(x1, y0, z1, 1),
        new TgdVec4(x1, y1, z0, 1),
        new TgdVec4(x1, y1, z1, 1),
    ].map((vec) => vec.applyMatrix(matrix))
    const transformedBBox = new TgdBoundingBox()
    for (const [x, y, z] of points) {
        transformedBBox.addPoint(x, y, z)
    }
    return transformedBBox
}
