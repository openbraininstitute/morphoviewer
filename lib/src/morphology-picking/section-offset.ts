import { type TgdCamera, TgdMat4, TgdVec2, TgdVec4, tgdCalcClamp } from "@tolokoban/tgd";

import type { PickableSegment, SectionSegmentIndex } from "./types";

/**
 * Where along its section a click landed, as a `0..1` offset — SONATA's normalized section
 * offset.
 *
 * The pick buffer resolves only which segment was hit, so the position within it comes from
 * projecting the click onto that segment, then walking the section to accumulate distance.
 */
export function computeSectionOffset(
  sections: SectionSegmentIndex,
  item: PickableSegment,
  camera: TgdCamera,
  xScreen: number,
  yScreen: number
) {
  const offsetSegment = computeSegmentOffset(item, camera, xScreen, yScreen);
  const segments = sections.getSegmentsOfSection(item.sectionName);
  let distance = 0;
  let totalDistance = 0;
  for (const segment of segments) {
    totalDistance += segment.segmentLength;
    if (segment.segmentIndex === item.segmentIndex) {
      distance += segment.segmentLength * offsetSegment;
    } else if (segment.segmentIndex < item.segmentIndex) {
      distance += segment.segmentLength;
    }
  }
  return totalDistance > 0 ? distance / totalDistance : 0;
}

/**
 * Where along one segment the click landed, as a `0..1` offset.
 *
 * Done in screen space because a click carries no depth: there is no world-space point to
 * compare against, only the 2D line the user actually saw.
 */
function computeSegmentOffset(
  item: PickableSegment,
  camera: TgdCamera,
  xScreen: number,
  yScreen: number
): number {
  const start = new TgdVec4(...item.start, 1);
  const end = new TgdVec4(...item.end, 1);
  const matrix = new TgdMat4(camera.matrixProjection).multiply(camera.matrixModelView);
  start.applyMatrix(matrix);
  start.scale(1 / start.w);
  end.applyMatrix(matrix);
  end.scale(1 / end.w);
  const vecU = new TgdVec2(end.x - start.x, end.y - start.y);
  const length = vecU.size;
  vecU.normalize();
  const vecV = new TgdVec2(xScreen - start.x, yScreen - start.y);
  const distance = vecU.dot(vecV);
  return tgdCalcClamp(length > 0 ? distance / length : 0, 0, 1);
}
