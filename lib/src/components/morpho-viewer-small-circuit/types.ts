import { TgdPainterGizmoOptions } from "@tolokoban/tgd"

import { ControlsLayoutProps } from "../controls-layout/controls-layout"
import { PropsForGizmo, PropsForScalebar } from "../types"

import type { MorphoViewerTree } from "../morpho-viewer-simul"

export interface MorphoViewerSmallCircuitCell {
    id: string
    center: [x: number, y: number, z: number]
    orientation: [x: number, y: number, z: number, w: number]
    somaRadius: number
    color?: string
}

export type MorphoViewerSmallCircuitCellData = {
    type: "tree"
    data: MorphoViewerTree
}

export type MorphoViewerSmallCircuitProps = PropsForGizmo & PropsForScalebar & {
    className?: string
    backgroundColor?: string
    circuit: MorphoViewerSmallCircuitCell[]
    /**
     * Ids of the cells we want to highlight.
     */
    highlightedCellIds?: string[]
    onCellHover?(cell: MorphoViewerSmallCircuitCell | undefined): void
    onCellClick?(cell: MorphoViewerSmallCircuitCell | undefined): void
    onClose?(): void
    onMinimize?(): void
    /**
     * A function to load a cell.
     * @param id Unique identifier of the cell from attribute `circuit`.
     */
    loadCell(id: string): Promise<MorphoViewerSmallCircuitCellData | null>
    /**
     * This callback is called when the loading starts (with a value of __0__),
     * then every time a cell is loaded.
     *
     * @param progress Percentage of loaded cells so far. Between `0.0` and `1.0`.
     */
    onLoadProgress?(progress: number): void
    controls?: ControlsLayoutProps["content"]
}
