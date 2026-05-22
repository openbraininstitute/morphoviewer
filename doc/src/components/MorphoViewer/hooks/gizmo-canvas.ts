import { GizmoCanvas } from "@openbraininstitute/morphoviewer"
import React from "react"

export function useGizmoCanvas(): GizmoCanvas {
    const refGizmoCanvas = React.useRef<GizmoCanvas | null>(null)
    if (!refGizmoCanvas.current) refGizmoCanvas.current = new GizmoCanvas()
    return refGizmoCanvas.current

}