export function paint(canvas: HTMLCanvasElement, spacePerPixel: number, color = "#4f3") {
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = color
    ctx.fillText(`${spacePerPixel}`, 0, h)
}

