import {
  type ArrayNumber4,
  TgdLight,
  TgdMaterial,
  TgdTexture2D,
  TgdVec3,
  TgdVec4,
} from "@tolokoban/tgd";

export type MaterialDiffuseAlphaOptions = Partial<{
  color: TgdVec4 | ArrayNumber4 | TgdTexture2D;
  light: TgdLight;
  ambient: TgdLight;
  specularExponent: number;
  specularIntensity: number;
  lockLightsToCamera: boolean;
  /**
   * Every fragment with an alpha strictly lower than `alphaCut` will be discarded.
   */
  alphaCut: number;
  /** Fragment alpha in [0..1]. Default `1`. */
  opacity: number;
}>;

/**
 * Like `TgdMaterialDiffuse`, but writes a controllable fragment alpha
 * (`TgdMaterialDiffuse` hardcodes alpha to `1.0`).
 */
export class MaterialDiffuseAlpha extends TgdMaterial {
  light: TgdLight;
  ambient: TgdLight;
  specularExponent: number;
  specularIntensity: number;
  alphaCut: number;
  readonly texture: TgdTexture2D | null;
  private _opacity: number;
  private readonly lightColor = new TgdVec3();
  private readonly ambientColor = new TgdVec3();

  constructor(options: MaterialDiffuseAlphaOptions = {}) {
    const alphaCut = options.alphaCut ?? 0;
    const colorOrTexture =
      options.color instanceof TgdTexture2D
        ? options.color
        : new TgdVec4(options.color ?? DEFAULT_COLOR);
    const hasTexture = colorOrTexture instanceof TgdTexture2D;
    const uniforms = {
      uniAlphaCut: "float" as const,
      uniOpacity: "float" as const,
      uniLight: "vec3" as const,
      uniLightDir: "vec3" as const,
      uniAmbient: "vec3" as const,
      uniSpecularExponent: "float" as const,
      uniSpecularIntensity: "float" as const,
      uniModelViewMatrix: "mat4" as const,
    };
    const fragmentShaderCode = [
      hasTexture
        ? "vec4 color = texture(uniTextureColor, varUV);"
        : `vec4 color = vec4(${colorOrTexture.join(", ")});`,
      "if (color.a < uniAlphaCut) discard;",
      `vec3 normal = ${options.lockLightsToCamera ? "mat3(uniModelViewMatrix) * " : ""}normalize(varNormal);`,
      "float light = 1.0 - dot(normal, uniLightDir);",
      options.lockLightsToCamera ? "light = max(0.0, light - 1.0);" : "light *= .5;",
      `vec3 reflection = ${options.lockLightsToCamera ? "" : "mat3(uniModelViewMatrix) * "}reflect(uniLightDir, normal);`,
      "float spec = max(0.0, reflection.z);",
      "spec = pow(spec, uniSpecularExponent) * uniSpecularIntensity;",
      "color = vec4(",
      "  color.rgb * (",
      "    uniAmbient + uniLight * light",
      "  ) + vec3(spec),",
      "  uniOpacity",
      ");",
      "return color;",
    ];
    const varyings: { varNormal: "vec3"; varUV?: "vec2" } = {
      varNormal: "vec3",
    };
    if (hasTexture) {
      varyings.varUV = "vec2";
    }
    super({
      uniforms,
      textures: hasTexture
        ? {
            uniTextureColor: colorOrTexture,
          }
        : {},
      varyings,
      vertexShaderCode: () => {
        const code = [`varNormal = mat3(uniTransfoMatrix) * ${this.attNormal};`];
        if (hasTexture) {
          code.push(`varUV = ${this.attUV};`);
        }
        return code;
      },
      fragmentShaderCode,
      setUniforms: ({ program }) => {
        program.uniform1f("uniAlphaCut", this.alphaCut);
        program.uniform1f("uniOpacity", this._opacity);
        program.uniform3fv("uniLightDir", this.light.direction);
        this.lightColor.from(this.light.color).scale(this.light.color.w);
        program.uniform3fv("uniLight", this.lightColor);
        this.ambientColor.from(this.ambient.color).scale(this.ambient.color.w);
        program.uniform3fv("uniAmbient", this.ambientColor);
        program.uniform1f("uniSpecularExponent", this.specularExponent);
        program.uniform1f("uniSpecularIntensity", this.specularIntensity);
      },
    });
    this.light = new TgdLight({
      direction: [-0.3, 0.3, -1],
    });
    this.ambient = new TgdLight({ color: new TgdVec4(0.2, 0.1, 0, 0) });
    this.specularExponent = 20;
    this.specularIntensity = 1;
    this.alphaCut = alphaCut;
    this._opacity = options.opacity ?? 1;
    this.texture = hasTexture ? colorOrTexture : null;
    if (options.light) {
      this.light = options.light;
    }
    if (options.ambient) {
      this.ambient = options.ambient;
    }
    if (typeof options.specularExponent === "number") {
      this.specularExponent = options.specularExponent;
    }
    if (typeof options.specularIntensity === "number") {
      this.specularIntensity = options.specularIntensity;
    }
  }

  get opacity(): number {
    return this._opacity;
  }
  set opacity(opacity: number) {
    this._opacity = opacity;
  }
}

const DEFAULT_COLOR = new TgdVec4(0.8, 0.6, 0.1, 1);
