import { tgdCodeFunction_float01ToVec3, TgdMaterial } from "@tolokoban/tgd"

export class MaterialIndex extends TgdMaterial {
    constructor() {
        super({
            varyings: {
                varColor: "vec3",
            },
            extraVertexShaderFunctions: {
                ...tgdCodeFunction_float01ToVec3(),
            },
            vertexShaderCode: [
                "varColor = float01ToVec3(mix(attUV1_A.y, attUV1_B.y, uniMix));",
            ],
            fragmentShaderCode: ["return vec4(varColor, 1);"],
        })
    }
}
