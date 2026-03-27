import {
  TgdContext,
  TgdLight,
  TgdMaterialDiffuse,
  TgdPainterGroup,
  TgdPainterSegments,
  TgdPainterSegmentsData,
  TgdPainterState,
  TgdVec3,
  webglPresetBlend,
  webglPresetCull,
  webglPresetDepth,
} from "@tolokoban/tgd";

export class PainterHover extends TgdPainterGroup {
  constructor(
    public readonly context: TgdContext,
    segments: TgdPainterSegmentsData,
  ) {
    super();
    this.add(
      new TgdPainterState(context, {
        blend: webglPresetBlend.add,
        cull: webglPresetCull.back,
        depth: webglPresetDepth.always,
        children: [
          new TgdPainterSegments(context, {
            roundness: 32,
            minRadius: 2,
            dataset: segments.makeDataset,
            material: new TgdMaterialDiffuse({
              color: [0.8, 0.6, 0.3, 1],
              specularExponent: 1,
              specularIntensity: 0.5,
              lockLightsToCamera: true,
              light: new TgdLight({
                direction: new TgdVec3(0, 0, -1),
              }),
            }),
          }),
        ],
      }),
    );
  }
}
