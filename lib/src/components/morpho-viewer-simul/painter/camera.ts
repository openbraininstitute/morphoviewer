import {
    type ArrayNumber3,
    type TgdCamera,
    TgdCameraPerspective,
} from "@tolokoban/tgd"

interface BoundingBox {
    min: ArrayNumber3
    max: ArrayNumber3
    center: ArrayNumber3
}

export function makeCamera({
    bbox,
    bboxSoma,
    bboxDendrites,
}: {
    bbox: BoundingBox
    bboxSoma: BoundingBox
    bboxDendrites: BoundingBox
}): { camera: TgdCamera; zoomMin: number; zoomMax: number } {
    const camera = new TgdCameraPerspective({
        transfo: {
            distance: 5,
            position: bbox.center,
        },
        near: 1,
    })
    camera.screenHeight = camera.screenWidth
    const distance = computeDistance(camera, bboxDendrites, 1.1)
    const distanceMax = ensureBigger(
        distance,
        computeDistance(camera, bbox, 1.5)
    )
    const distanceMin = ensureSmaller(
        computeDistance(camera, bboxSoma, 3),
        distance
    )
    const zoomMin = distance / distanceMax
    const zoomMax = distance / distanceMin
    camera.transfo.distance = distance

    const cameraDebug = new TgdCameraPerspective({
        name: "TgdCamera#2",
        fovy: 0.7853981633974483,
        near: 1,
        far: 1000000,
        zoom: 1,
        transfo: {
            distance: 102.8030104273777,
            position: [
                -7.627975584512114e-9, 2.6626955218489456e-7,
                -3.689811478579941e-8,
            ],
            orientation: [
                -0.325153112411499, -0.36380523443222046, 0.1464145928621292,
                0.8605138063430786,
            ],
            scale: [1, 1, 1],
        },
    })
    return { camera: cameraDebug, zoomMin, zoomMax }
}

function ensureSmaller(value: number, limit: number) {
    if (value < limit) return value
    return limit * 0.9
}

function ensureBigger(value: number, limit: number) {
    if (value > limit) return value
    return limit * 1.1
}

function computeDistance(camera: TgdCamera, bbox: BoundingBox, scale: number) {
    const width =
        2 *
        scale *
        Math.max(
            1,
            Math.abs(bbox.center[0] - bbox.min[0]),
            Math.abs(bbox.center[0] - bbox.max[0])
        )
    const height =
        2 *
        scale *
        Math.max(
            1,
            Math.abs(bbox.center[1] - bbox.min[1]),
            Math.abs(bbox.center[1] - bbox.max[1])
        )
    camera.fitSpaceAtTarget(width, height)
    return camera.transfo.distance
}
