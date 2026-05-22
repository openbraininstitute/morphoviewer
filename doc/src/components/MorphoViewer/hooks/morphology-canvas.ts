import { MorphologyCanvas } from "@openbraininstitute/morphoviewer"
import React from "react"

export function useMorphoCanvas(): MorphologyCanvas {
    const refMorphoCanvas = React.useRef<MorphologyCanvas | null>(null)
    if (!refMorphoCanvas.current) refMorphoCanvas.current = new MorphologyCanvas()
    return refMorphoCanvas.current
}