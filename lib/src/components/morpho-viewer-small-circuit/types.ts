import { TgdPainterGizmoOptions } from "@tolokoban/tgd"
import { ControlsLayoutProps } from "../controls-layer/controls-layout"
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

export interface MorphoViewerSmallCircuitProps {
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
    /**
     * Display the axes controller gizmo.
     * - `false`: do not show the Gizmo
     * - `true`: show it with default options
     * - `Partial<object>`:
     *   - `alignX`: -1 meand left and +1 means right
     *   - `alignY`: -1 meand bottom and +1 means top
     *   - `size`: size of the Gizmo side in pixels
     *   - `margin`: margin from the borders of the viewer (in pixels)
     */
    gizmo?: boolean | TgdPainterGizmoOptions
    /**
     * Defines the control that are embedded with the viewer,
     * in the header.
     * 
     * It's a list of blocks that are align with a wrappable flex layout and space between justification.
     * If a block is an array, then its content is wrapped in a `<div></div>`.
     * 
     * Common actions can be defined by a name. Example: `reset-camera`, `fullscreen`, `minimize`, `close`.
     */
    controls?: ControlsLayoutProps["content"]
}
