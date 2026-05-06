import type { TgdContext, TgdEvent } from "@tolokoban/tgd"

export function watchSpacePerPixel(context: TgdContext, event: TgdEvent<number>) {
    let spacePerPixel = -1
    const listener = () => {
        const value = context.camera.spacePerPixel
        if (value === spacePerPixel) return

        spacePerPixel = value
        event.dispatch(value)
    }
    context.eventPaint.addListener(listener)
    return () => context.eventPaint.removeListener(listener)
}