/** biome-ignore-all lint/suspicious/useIterableCallbackReturn: <explanation> */
import {
  type ArrayNumber4,
  type TgdContext,
  TgdPainterGroup,
  TgdPainterPointsCloud,
  TgdPainterPointsCloudMorphing,
  type TgdPainterSegmentsData,
  TgdTexture2D,
  TgdVec3,
  tgdCalcMix,
  tgdCanvasCreateFill,
} from "@tolokoban/tgd";

import type { MorphoViewerSynapsesGroup } from "../../types/public";
import type { MorphologyData } from "../morphology-data";
import type { Structure } from "../structure";

export class PainterSynapses extends TgdPainterGroup {
  private readonly textures: TgdTexture2D[] = [];
  private readonly cloud: TgdPainterPointsCloudMorphing;

  constructor(
    context: TgdContext,
    synapses: MorphoViewerSynapsesGroup,
    data: MorphologyData,
  ) {
    super();
    const texture = new TgdTexture2D(context).loadBitmap(
      tgdCanvasCreateFill(1, 1, synapses.color),
    );
    this.textures.push(texture);

    const cloud = new TgdPainterPointsCloudMorphing(context, {
      name: `TgdPainterPointsCloud[${synapses.color}]`,
      data: [
        [
          makeDataPoint(synapses.sections, data.structure, data.segments3D),
          makeDataPoint(
            synapses.sections,
            data.structure,
            data.segmentsDendrogram,
          ),
        ],
      ],
      minSizeInPixels: 4,
      radiusMultiplier: 0.5,
      texture,
    });
    this.cloud = cloud;
    this.add(cloud);
  }

  get mix() {
    return this.cloud.mix;
  }
  set mix(mix: number) {
    this.cloud.mix = mix;
  }

  delete(): void {
    super.delete();
    this.textures.forEach((texture) => texture.delete());
  }
}

function makeDataPoint(
  sections: Record<string, number[]>,
  structure: Structure,
  segments: Map<number, TgdPainterSegmentsData>,
): { point: Float32Array } {
  let counter = 0;
  const dataPoint: number[] = [];
  for (const [sectionName, offsets] of Object.entries(sections)) {
    for (const offsetInSection of offsets) {
      const { segment, offset } = structure.getSegmentOfSectionAtOffset(
        sectionName,
        offsetInSection,
      );
      const targetSegment = segments.get(segment.index);
      if (!targetSegment) continue;

      const [x, y, z] = computePositionOnSegmentSurface(
        targetSegment.getXYZR0(0),
        targetSegment.getXYZR1(0),
        offset,
        counter++,
      );
      dataPoint.push(x, y, z, 1);
    }
  }
  return { point: new Float32Array(dataPoint) };
}

function computePositionOnSegmentSurface(
  start: ArrayNumber4,
  end: ArrayNumber4,
  offset: number,
  randomSeed: number,
): [x: number, y: number, z: number] {
  const [x0, y0, z0, r0] = start;
  const [x1, y1, z1, r1] = end;
  const vecZ = new TgdVec3(x1, y1, z1).subtract([x0, y0, z0]);
  const lengthZ = vecZ.length;
  if (lengthZ < 1e-12) {
    return computePositionOnSphereSurface(x0, y0, z0, r0, randomSeed);
  }
  const x = tgdCalcMix(x0, x1, offset);
  const y = tgdCalcMix(y0, y1, offset);
  const z = tgdCalcMix(z0, z1, offset);
  const radius = tgdCalcMix(r0, r1, offset);
  const angle = randomSeed;
  vecZ.normalize();
  const vecX = computeVecX(vecZ);
  const vecY = vecZ.cross(vecX);
  vecX.scale(radius * Math.cos(angle));
  vecY.scale(radius * Math.sin(angle));
  const [xx, yy, zz] = new TgdVec3(x, y, z).add(vecX).add(vecY);
  return [xx, yy, zz];
}

function computePositionOnSphereSurface(
  x: number,
  y: number,
  z: number,
  r: number,
  randomSeed: number,
): [x: number, y: number, z: number] {
  const lat = randomSeed;
  const lng = randomSeed * 7.4656519;
  const Z = Math.sin(lat);
  const R = Math.cos(lat);
  return [x + r * R * Math.cos(lng), y + r * R * Math.sin(lng), z + r * Z];
}

function computeVecX(vecZ: TgdVec3) {
  const vecX = new TgdVec3(0, 1, 0).cross(vecZ);
  if (vecX.dot(vecX) > 1e-12) return vecX;
  return new TgdVec3(1, 0, 0).cross(vecZ);
}
