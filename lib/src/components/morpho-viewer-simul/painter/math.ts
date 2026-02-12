import { TgdVec4, TgdCamera, TgdMat4, TgdVec2, tgdCalcClamp } from '@tolokoban/tgd';

import { Structure, StructureItem } from './structure';

export function computeSectionOffset(
  structure: Structure,
  item: StructureItem,
  camera: TgdCamera,
  xScreen: number,
  yScreen: number
) {
  const offsetSegment = computeSegmentOffset(item, camera, xScreen, yScreen);
  const segments = structure.getSegmentsOfSection(item.sectionName);
  let distance = 0;
  let totalDistance = 0;
  for (const segment of segments) {
    totalDistance += segment.length;
    if (segment.segmentIndex === item.segmentIndex) {
      distance += segment.length * offsetSegment;
    } else if (segment.segmentIndex < item.segmentIndex) {
      distance += segment.length;
    }
  }
  return totalDistance > 0 ? distance / totalDistance : 0;
}

function computeSegmentOffset(
  item: StructureItem,
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
