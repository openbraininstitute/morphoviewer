import { TgdMaterial, tgdCodeFunction_float01ToVec3 } from "@tolokoban/tgd";

/**
 * Writes a segment's index as a flat colour, for a non-morphing `TgdPainterSegments`.
 * Sibling of {@link MaterialIndex}, which does the same for the morphing painter.
 *
 * Reads `uv.y` rather than a segment attribute: the vertex code is injected into
 * `applyMaterial(position, normal, uv)` where those attributes are out of scope, and the same
 * material is applied to `PainterCell`'s soma icosphere, which has none. The segments painter
 * passes `((attUV0 + attUV1) * .5)`, and both endpoints carry the same `v`, so the index
 * survives the average.
 */
export class MaterialSegmentIndex extends TgdMaterial {
  constructor() {
    super({
      varyings: {
        varColor: "vec3",
      },
      extraVertexShaderFunctions: {
        ...tgdCodeFunction_float01ToVec3(),
      },
      vertexShaderCode: ["varColor = float01ToVec3(uv.y);"],
      fragmentShaderCode: ["return vec4(varColor, 1);"],
    });
  }
}
