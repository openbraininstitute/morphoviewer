import { TgdMaterial, type TgdTexture2D } from "@tolokoban/tgd";

export interface MaterialFlatTextureIntensityOptions {
  texture: TgdTexture2D;
  /** Starting intensity in `[0..1]`. Default `0` — nothing added. */
  intensity?: number;
}

/**
 * Like `TgdMaterialFlatTexture`, but scales the texture colour by a per-painter
 * scalar.
 *
 * The circuit draws its highlight pass additively over the finished image, so
 * what this material writes *is* the extra brightness a cell gets: `0` leaves
 * the cell as it was drawn, `1` is the full hover highlight. Anything in
 * between is a spike fading out.
 *
 * `TgdMaterialFlatTexture` can only be all or nothing — switching a cell off
 * meant swapping in a black texture — and a fade needs every value between.
 */
export class MaterialFlatTextureIntensity extends TgdMaterial {
  private _intensity: number;

  constructor(options: MaterialFlatTextureIntensityOptions) {
    super({
      uniforms: {
        uniIntensity: "float" as const,
      },
      varyings: {
        varUV: "vec2" as const,
      },
      textures: {
        uniTextureColor: options.texture,
      },
      vertexShaderCode: () => [`varUV = ${this.attUV};`],
      fragmentShaderCode: [
        "vec4 color = texture(uniTextureColor, varUV);",
        "return vec4(color.rgb * uniIntensity, color.a);",
      ],
      setUniforms: ({ program }) => {
        program.uniform1f("uniIntensity", this._intensity);
      },
    });
    this._intensity = options.intensity ?? 0;
  }

  get intensity(): number {
    return this._intensity;
  }
  set intensity(intensity: number) {
    this._intensity = intensity;
  }
}
