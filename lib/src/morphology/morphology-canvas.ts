import {
    type ArrayNumber3,
    TgdBoundingBox,
    TgdCanvasGizmo,
    type TgdControllerCameraOrbitZoomRequest,
    TgdDataGlb,
    TgdEvent,
    TgdMat3,
    TgdMaterialDiffuse,
    TgdPainterClear,
    TgdPainterDepth,
    TgdPainterLogic,
    TgdPainterMeshGltf,
    TgdPainterState,
    TgdQuat,
    TgdTexture2D,
    TgdVec3,
    tgdActionCreateCameraInterpolation,
    tgdEasingFunctionInOutCubic,
    tgdFullscreenTest,
} from "@tolokoban/tgd"

import { AbstractCanvas, type CanvasOptions } from "../abstract-canvas"
import { FRAME_MARGIN } from "../behaviors"
import Colors, { type ColorsInterface, colorToRGBA } from "../colors"
import { type CellNode, parseSwc } from "../parser/swc"
import { CellNodeType, type ColoringType } from "../types"
import { SwcPainter } from "./painter"
import { CellNodes } from "./painter/nodes"

type MeshNeurite = Exclude<keyof ColorsInterface, "background">

const MESH_NEURITES: [RegExp, MeshNeurite][] = [
    [/soma/i, "soma"],
    [/axon/i, "axon"],
    [/basal/i, "basalDendrite"],
    [/apical/i, "apicalDendrite"],
]

function meshNeurite(name = ""): MeshNeurite | undefined {
    return MESH_NEURITES.find(([pattern]) => pattern.test(name))?.[1]
}

/**
 * Here is an example of how to use this class in a React project:
 *
 * ```tsx
 * import { MorphologyCanvas } from "@openbraininstitute/morphoviewer"
 *
 * export function MyMorphoViewer({ swc }: { swc: string }) {
 *   const refViewer = React.useRef<MorphologyCanvas | null>(null)
 *   const mountCanvas = (canvas: HTMLCanvasElement | null) => {
 *     refViewer.current?.canvas = canvas
 *   }
 *   React.useEffect(
 *     ()=>{
 *       if (refViewer.current) return
 *
 *       refViewer.current = new MorphologyCanvas()
 *       refViewer.current.swc = swc
 *     }, []
 *   }
 *   return <canvas ref={mountCanvas}></canvas>
 * }
 * ```
 */
export class MorphologyCanvas extends AbstractCanvas {
    public readonly colors: ColorsInterface
    public readonly eventColorsChange = new TgdEvent<ColorsInterface>();

    private _customColorsForSection: string[] | null = null;
    private _customColorsForDistance: string[] | null = null;

    private _maxDendriteLength = 0;
    private _minRadius = 2.5;
    private _swc: string | null = null;
    private nodesManager: CellNodes | null = null;
    private painter: SwcPainter | null = null;
    private clear: TgdPainterClear | null = null;
    private _colorBy: ColoringType = "section";
    private _radiusType: number = 0;
    private _radiusMultiplier: number = 1;
    private _nodes: CellNode[] = [];
    private morphoWidthAtTarget = 1;
    private morphoHeightAtTarget = 1;
    private _mode: "skeleton" | "mesh" = "skeleton";
    private mesh: TgdDataGlb | null = null;
    private meshBounds: { center: TgdVec3; points: TgdVec3[] } | null = null;
    private painterMesh: TgdPainterState | null = null;
    private meshParts: { neurite?: MeshNeurite; painter: TgdPainterMeshGltf }[] = [];
    private meshTextures = new Map<MeshNeurite, TgdTexture2D>();
    private gizmo: TgdCanvasGizmo | null = null;

    constructor(options: Partial<CanvasOptions> = {}) {
        super({
            name: "MorphologyCanvas",
            cameraController: {
                minZoom: 0.5,
                maxZoom: 100,
                inertiaOrbit: 1000,
            },
            ...options,
        })
        const colors = new Colors()
        colors.eventChange.addListener(this.handleColorsChange)
        this.colors = colors
    }

    get customColorsForSection() {
        return this._customColorsForSection
    }
    /**
     * Colors for the section will be picked __without interpolation__
     * from this list of colors, according to property `v` of each CellNode.
     */
    set customColorsForSection(colors: string[] | null) {
        this._customColorsForSection = !colors || colors.length === 0 ? null : colors
        this.handleColorsChange()
    }

    get customColorsForDistance() {
        return this._customColorsForDistance
    }
    /**
     * Colors for the distance will be picked __with linear interpolation__
     * from this list of colors, according to property `u` of each CellNode.
     */
    set customColorsForDistance(colors: string[] | null) {
        this._customColorsForDistance = !colors || colors.length === 0 ? null : colors
        this.handleColorsChange()
    }

    /**
     * Length of the longest neurite.
     */
    get maxDendriteLength() {
        return this._maxDendriteLength
    }

    hasSoma(): boolean {
        return this.hasNeurite(CellNodeType.Soma, "soma")
    }

    hasAxon(): boolean {
        return this.hasNeurite(CellNodeType.Axon, "axon")
    }

    hasApicalDendrite(): boolean {
        return this.hasNeurite(CellNodeType.ApicalDendrite, "apicalDendrite")
    }

    hasBasalDendrite(): boolean {
        return this.hasNeurite(CellNodeType.BasalDendrite, "basalDendrite")
    }

    private hasNeurite(type: CellNodeType, neurite: MeshNeurite): boolean {
        if (this.nodesManager?.nodeTypes.includes(type)) return true

        return (this.mesh?.json.meshes ?? []).some(({ name }) => meshNeurite(name) === neurite)
    }

    get mode() {
        return this._mode
    }
    set mode(mode: "skeleton" | "mesh") {
        if (this._mode === mode) return

        this._mode = mode
        this.applyMode()
    }

    /**
     * Parts named after a neurite type (soma, axon, basal, apical) follow that type's
     * color and visibility in `colors`. Other parts keep their GLB color.
     */
    async loadMesh(glb: ArrayBuffer) {
        const mesh = await TgdDataGlb.parse(glb)
        this.mesh = mesh
        this.meshBounds = computeMeshBounds(mesh)
        this.addPainterMesh()
        if (!this.nodesManager) this.resetCamera()
        this.applyMode()
    }

    get gizmoCanvas() {
        return this.gizmo?.canvas ?? null
    }
    set gizmoCanvas(canvas: HTMLCanvasElement | null) {
        if (!this.gizmo) {
            if (!canvas) return

            this.gizmo = new TgdCanvasGizmo({
                alpha: true,
                antialias: true,
                resolution: Math.max(1, Math.min(globalThis.devicePixelRatio || 1, 3)),
                name: "Gizmo",
            })
            this.gizmo.eventTipClick.addListener(this.interpolateCamera)
            if (this.context) this.gizmo.attachContext(this.context)
        }
        this.gizmo.canvas = canvas
    }

    get minRadius() {
        return this.painter?.minRadius ?? this._minRadius
    }

    set minRadius(value: number) {
        if (this._minRadius === value) return

        this._minRadius = value
        if (this.painter) {
            this.painter.minRadius = value
            this.paint()
        }
    }

    public readonly interpolateCamera = (journey: {
        from: Readonly<TgdQuat>
        to: Readonly<TgdQuat>
    }) => {
        const { context } = this
        if (!context) return

        context.camera.transfo.orientation = journey.from
        this.resetCamera(journey.to, 0.3)
    };

    public readonly resetCamera = (newOrientation?: Readonly<TgdQuat>, transition = 0) => {
        const { context } = this
        if (!context) return

        const { camera } = context
        const { nodesManager: nodes, meshBounds } = this
        const skeleton = nodes && { center: nodes.center, points: this._nodes }
        const shown = this._mode === "mesh" ? (meshBounds ?? skeleton) : (skeleton ?? meshBounds)
        if (shown) {
            const [sx, sy] = computeBoundingBox(shown.points, shown.center, newOrientation ?? new TgdQuat())
            const morphoWidth = Math.max(1e-6, Math.abs(sx)) * FRAME_MARGIN
            const morphoHeight = Math.max(1e-6, Math.abs(sy)) * FRAME_MARGIN
            this.morphoWidthAtTarget = morphoWidth
            this.morphoHeightAtTarget = morphoHeight
            camera.fitSpaceAtTarget(morphoWidth, morphoHeight)
            context.animSchedule({
                action: tgdActionCreateCameraInterpolation(camera, {
                    zoom: 1,
                    position: shown.center,
                    orientation: newOrientation,
                }),
                duration: transition,
                easingFunction: tgdEasingFunctionInOutCubic,
            })
        } else {
            camera.transfo.orientation.face("+X+Y+Z")
        }
        context.paint()
    };

    get colorBy() {
        return this.painter?.colorBy ?? this._colorBy
    }
    set colorBy(value: ColoringType) {
        if (this._colorBy === value) return

        const { painter } = this
        this._colorBy = value
        if (painter) {
            painter.colorBy = value
            this.paint()
        }
    }

    get radiusType() {
        return this.painter?.radiusType ?? this._radiusType
    }

    set radiusType(value) {
        if (this._radiusType === value) return

        const { painter } = this
        this._radiusType = value
        if (painter) {
            painter.radiusType = value
            this.paint()
        }
    }

    get radiusMultiplier() {
        return this.painter?.radiusMultiplier ?? this._radiusMultiplier
    }
    set radiusMultiplier(value) {
        if (this._radiusMultiplier === value) return

        const { painter } = this
        this._radiusMultiplier = value
        if (painter) {
            painter.radiusMultiplier = value
            this.paint()
        }
    }

    get swc() {
        return this._swc
    }
    set swc(swc: string | null) {
        if (swc === this._swc) {
            // This content is already loaded.
            return
        }

        this.nodesManager = null
        if (swc !== null) {
            this.nodes = parseSwc(swc)
        }
        // Set after parsing, so a file that failed to parse is not skipped next time.
        this._swc = swc
    }

    get nodes() {
        return this._nodes
    }
    set nodes(nodes: CellNode[]) {
        this._nodes = nodes
        const nodesManager = new CellNodes(nodes)
        this._maxDendriteLength = nodesManager.computeDistancesFromSoma()
        this.nodesManager = nodesManager
        this.addPainterSkeleton()
        if (!this.meshBounds) this.resetCamera()
        this.applyMode()
    }

    public readonly paint = () => {
        const { context } = this
        if (!context) return

        context.paint()
    };

    private readonly handleColorsChange = () => {
        const { colors, customColorsForSection, customColorsForDistance } = this
        this.painter?.resetColors(colors, customColorsForSection, customColorsForDistance)
        this.eventColorsChange.dispatch({
            apicalDendrite: colors.apicalDendrite,
            axon: colors.axon,
            background: colors.background,
            basalDendrite: colors.basalDendrite,
            soma: colors.soma,
        })
        this.resetClearColor()
        this.resetMeshColors()
        this.paint()
    };

    private resetClearColor() {
        const { clear, colors } = this
        if (clear) {
            const [red, green, blue, alpha] = colorToRGBA(colors.background)
            clear.red = red
            clear.green = green
            clear.blue = blue
            clear.alpha = alpha
        }
    }

    protected init() {
        const { canvas, context } = this
        if (!canvas || !context) return

        if (this.nodesManager || this.meshBounds) this.resetCamera()
        context.removeAll()
        const clear = new TgdPainterClear(context, {
            color: [0, 0, 0, 1],
            depth: 1,
        })
        this.clear = clear
        this.resetClearColor()
        const depth = new TgdPainterDepth(context, {
            enabled: true,
            func: "LESS",
            mask: true,
            rangeMin: 0,
            rangeMax: 1,
        })
        context.add(
            new TgdPainterLogic(() => {
                context.camera.fitSpaceAtTarget(this.morphoWidthAtTarget, this.morphoHeightAtTarget)
            }),
            clear,
            depth
        )
        this.addPainterSkeleton()
        this.addPainterMesh()
        this.applyMode()
        // The gizmo's camera listeners were bound to the previous context.
        this.gizmo?.attachContext(context)
        const { orbiter } = this
        if (orbiter) orbiter.onZoomRequest = this.handleZoomRequest
    }

    private addPainterSkeleton() {
        const { context, nodesManager: nodes } = this
        if (!context || !nodes) return

        if (this.painter) context.remove(this.painter)
        const segments = new SwcPainter(context, nodes)
        segments.minRadius = this._minRadius
        segments.colorBy = this._colorBy
        segments.radiusType = this._radiusType
        segments.radiusMultiplier = this._radiusMultiplier
        segments.resetColors(this.colors, this.customColorsForSection, this.customColorsForDistance)
        this.painter = segments
        context.add(segments)
    }

    private addPainterMesh() {
        const { context, mesh } = this
        if (!context || !mesh) return

        if (this.painterMesh) context.remove(this.painterMesh)
        for (const texture of this.meshTextures.values()) texture.delete()
        this.meshTextures.clear()
        this.meshParts = (mesh.json.meshes ?? []).map(({ name }, meshIndexOrName) => {
            const neurite = meshNeurite(name)
            // Meshes without UVs sample texel (0, 0), so refilling this 1×1 texture recolors them.
            let texture = neurite && this.meshTextures.get(neurite)
            if (neurite && !texture) {
                texture = new TgdTexture2D(context)
                this.meshTextures.set(neurite, texture)
            }
            const painter = new TgdPainterMeshGltf(context, {
                asset: mesh,
                meshIndexOrName,
                material: ({ color }) =>
                    new TgdMaterialDiffuse({ lockLightsToCamera: true, color: texture || color }),
            })
            return { neurite, painter }
        })
        this.painterMesh = new TgdPainterState(context, {
            depth: "less",
            cull: "back",
            children: this.meshParts.map(({ painter }) => painter),
        })
        context.add(this.painterMesh)
        this.resetMeshColors()
    }

    private resetMeshColors() {
        const { colors } = this
        for (const [neurite, texture] of this.meshTextures) texture.fill(colors[neurite])
        for (const { neurite, painter } of this.meshParts) {
            // Same rule as the skeleton: alpha below 1 hides a neurite, but never the soma.
            if (neurite && neurite !== "soma") painter.active = colorToRGBA(colors[neurite])[3] >= 1
        }
    }

    private applyMode() {
        const { painter, painterMesh } = this
        if (painter) painter.active = this._mode === "skeleton"
        if (painterMesh) painterMesh.active = this._mode === "mesh"
        this.paint()
    }

    /**
     * We accept the zoom only if the canvas is in fullscreen
     * or if the Ctrl key is pressed.
     */
    private readonly handleZoomRequest = (evt: TgdControllerCameraOrbitZoomRequest): boolean => {
        const { context } = this
        if (!context) return false

        const { canvas } = context.gl
        if (canvas instanceof HTMLCanvasElement && tgdFullscreenTest(canvas)) {
            return true
        }

        return evt.ctrlKey
    };
}

function computeBoundingBox(
    points: { x: number; y: number; z: number }[],
    center: Readonly<TgdVec3>,
    orientation: Readonly<TgdQuat>
): [number, number] {
    let x = 0
    let y = 0
    const mat = new TgdMat3().fromQuat(orientation).transpose()
    const vec = new TgdVec3()
    for (const point of points) {
        vec.reset(point.x, point.y, point.z).subtract(center).applyMatrix(mat)
        x = Math.max(x, Math.abs(vec.x))
        y = Math.max(y, Math.abs(vec.y))
    }
    return [x, y]
}

function computeMeshBounds(mesh: TgdDataGlb) {
    const all = new TgdBoundingBox()
    const soma = new TgdBoundingBox()
    for (const { name, primitives } of mesh.json.meshes ?? []) {
        for (const primitive of primitives) {
            const { min, max } = mesh.getAccessorByAttributeName(primitive, "POSITION")
            if (!min || !max) continue

            const bbox = { min: min as ArrayNumber3, max: max as ArrayNumber3 }
            all.addBBox(bbox)
            if (meshNeurite(name) === "soma") soma.addBBox(bbox)
        }
    }
    const [x0, y0, z0] = all.min
    const [x1, y1, z1] = all.max
    if (!Number.isFinite(x0)) return null

    const center = new TgdVec3(Number.isFinite(soma.min[0]) ? soma.center : all.center)
    const points = [x0, x1].flatMap((x) =>
        [y0, y1].flatMap((y) => [z0, z1].map((z) => new TgdVec3(x, y, z)))
    )
    return { center, points }
}
