const UNITS = ["m", "mm", "μm", "nm", "pm", "fm"]
const VALUES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 300, 400, 500, 600, 700, 800, 900]

export function paint(canvas: HTMLCanvasElement, spacePerPixel: number, unitFactor = 1e-6) {
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    ctx.lineWidth = 2
    ctx.clearRect(0, 0, w, h)
    const css = globalThis.getComputedStyle(canvas)
    ctx.fillStyle = css.color
    ctx.strokeStyle = css.color
    ctx.font = `${css.fontSize} ${css.fontFamily}`
    const minStepWidth = 3 * ctx.measureText("999 mm").width
    const { unitText, width, value } = computeBestFit(w, spacePerPixel, unitFactor, minStepWidth)
    let step = 0
    for (let stepX0 = 0; stepX0 + width < w; stepX0 += width) {
        const stepX1 = stepX0 + width
        step++
        const text = `${value * step} ${unitText} `
        const measure = ctx.measureText(text)
        const y = Math.round(measure.actualBoundingBoxAscent + measure.actualBoundingBoxDescent) + .5
        const x = Math.round(stepX1 - (width + measure.width) / 2) + .5
        ctx.fillText(text, x, y)
        const x0 = Math.round(stepX0) + .5
        const x1 = Math.round(stepX1) + .5
        const yy = h - measure.actualBoundingBoxAscent
        ctx.beginPath()
        ctx.moveTo(x0, yy)
        ctx.lineTo(x0, h)
        ctx.lineTo(x1, h)
        ctx.lineTo(x1, yy)
        ctx.stroke()
        if (step > 99) break
    }
}

function computeBestFit(scalebarSize: number, spacePerPixel: number, unitFactor: number, minStepWidth: number): { unitText: string; width: number; value: number } {
    const steps = Math.max(1, Math.floor(scalebarSize / minStepWidth))
    const stepSize = scalebarSize / steps
    let stepValue = stepSize * spacePerPixel * unitFactor
    let unitText = "?"
    let factor = unitFactor
    for (const candidate of UNITS) {
        unitText = candidate
        if (stepValue >= 1) break

        stepValue *= 1e3
        factor *= 1e3
    }
    let bestValue = 1
    for (const candidate of VALUES) {
        if (candidate > stepValue) break

        bestValue = candidate
    }
    const width = bestValue / (spacePerPixel * factor)
    return { unitText, width, value: bestValue }
}

