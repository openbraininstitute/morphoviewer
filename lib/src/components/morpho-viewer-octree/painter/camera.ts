import { type ArrayNumber3, TgdCameraOrthographic, TgdCameraPerspective, TgdVec3 } from "@tolokoban/tgd"

import { FRAME_MARGIN } from "@/behaviors"

type BBox = { min: ArrayNumber3; max: ArrayNumber3 }

export function makeCamera(bbox: BBox, screenWidth: number, screenHeight: number) {
    const camera = new TgdCameraOrthographic({
        far: 100,
        near: 0.1,
        zoom: 1,
    })
    camera.screenWidth = Math.max(1, screenWidth)
    camera.screenHeight = Math.max(1, screenHeight)
    const vecMin = new TgdVec3(bbox.min)
    const vecMax = new TgdVec3(bbox.max)
    const diameter = TgdVec3.distance(vecMin, vecMax)
    const vecDim = new TgdVec3(vecMax).subtract(vecMin)
    const center = new TgdVec3(vecMax).add(vecMin).scale(0.5)
    camera.transfo.position = center
    const width = vecDim.x
    const height = vecDim.y
    // Half extents, as tgd expects.
    camera.fitSpaceAtTarget(width * 0.5 * FRAME_MARGIN, height * 0.5 * FRAME_MARGIN)
    camera.near = camera.transfo.distance - diameter * 0.5
    camera.far = camera.transfo.distance + diameter * 0.5

    return { camera, width, height }
}
