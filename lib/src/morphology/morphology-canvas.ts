import {
  type TgdControllerCameraOrbitZoomRequest,
  TgdEvent,
  TgdMat3,
  type TgdMaterialDiffuse,
  TgdPainterClear,
  TgdPainterDepth,
  TgdPainterLogic,
  TgdQuat,
  TgdVec3,
  tgdActionCreateCameraInterpolation,
  tgdEasingFunctionInOutCubic,
  tgdFullscreenTest,
} from "@tolokoban/tgd";

import { AbstractCanvas, type CanvasOptions } from "../abstract-canvas";
import Colors, { type ColorsInterface, colorToRGBA } from "../colors";
import { type CellNode, parseSwc } from "../parser/swc";
import { computeScalebarAttributes, type ScalebarOptions } from "../scalebar";
import { CellNodeType, type ColoringType } from "../types";
import { SwcPainter } from "./painter";
import { CellNodes } from "./painter/nodes";

/**
 * Here is an example of how to use this class in a React project:
 *
 * ```tsx
 * import { MorphologyCanvas } from "@bbp/morphoviewer"
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
  public readonly colors: ColorsInterface;
  public readonly eventColorsChange = new TgdEvent<ColorsInterface>();

  private _customColorsForSection: string[] | null = null;
  private _customColorsForDistance: string[] | null = null;

  private _maxDendriteLength = 0;
  private _minRadius = 0.25;
  private _swc: string | null = null;
  private nodesManager: CellNodes | null = null;
  private painter: SwcPainter | null = null;
  private clear: TgdPainterClear | null = null;
  private _colorBy: ColoringType = "section";
  private _radiusType: number = 0;
  private _radiusMultiplier: number = 1;
  private material: TgdMaterialDiffuse | null = null;
  private _nodes: CellNode[] = [];
  private morphoWidthAtTarget = 1;
  private morphoHeightAtTarget = 1;

  constructor(options: Partial<CanvasOptions> = {}) {
    super({
      name: "MorphologyCanvas",
      cameraController: {
        minZoom: 0.5,
        maxZoom: 100,
        inertiaOrbit: 1000,
      },
      ...options,
    });
    const colors = new Colors();
    colors.eventChange.addListener(this.handleColorsChange);
    this.colors = colors;
  }

  get customColorsForSection() {
    return this._customColorsForSection;
  }
  /**
   * Colors for the section will be picked __without interpolation__
   * from this list of colors, according to property `v` of each CellNode.
   */
  set customColorsForSection(colors: string[] | null) {
    this._customColorsForSection =
      !colors || colors.length === 0 ? null : colors;
    this.handleColorsChange();
  }

  get customColorsForDistance() {
    return this._customColorsForDistance;
  }
  /**
   * Colors for the distance will be picked __with linear interpolation__
   * from this list of colors, according to property `u` of each CellNode.
   */
  set customColorsForDistance(colors: string[] | null) {
    this._customColorsForDistance =
      !colors || colors.length === 0 ? null : colors;
    this.handleColorsChange();
  }

  /**
   * Length of the longest neurite.
   */
  get maxDendriteLength() {
    return this._maxDendriteLength;
  }

  hasSoma(): boolean {
    return this.hasNodeType(CellNodeType.Soma);
  }

  hasAxon(): boolean {
    return this.hasNodeType(CellNodeType.Axon);
  }

  hasApicalDendrite(): boolean {
    return this.hasNodeType(CellNodeType.ApicalDendrite);
  }

  hasBasalDendrite(): boolean {
    return this.hasNodeType(CellNodeType.BasalDendrite);
  }
  /**
   * Check if a type has been found in the current SWC file.
   */
  private hasNodeType(type: CellNodeType): boolean {
    const { nodesManager: nodes } = this;
    if (!nodes) return false;

    return nodes.nodeTypes.includes(type);
  }

  get minRadius() {
    return this.painter?.minRadius ?? this._minRadius;
  }

  set minRadius(value: number) {
    if (this._minRadius === value) return;

    this._minRadius = value;
    if (this.painter) {
      this.painter.minRadius = value;
      this.paint();
    }
  }

  public readonly interpolateCamera = (journey: {
    from: Readonly<TgdQuat>;
    to: Readonly<TgdQuat>;
  }) => {
    const { context } = this;
    if (!context) return;

    context.camera.transfo.orientation = journey.from;
    this.resetCamera(journey.to, 300);
  };

  public readonly resetCamera = (
    newOrientation?: Readonly<TgdQuat>,
    transition = 0,
  ) => {
    const { context } = this;
    if (!context) return;

    const { camera } = context;
    const { nodesManager: nodes } = this;
    if (nodes) {
      // const [sx, sy] = nodes.bbox
      const [sx, sy] = computeBoundingBox(
        nodes,
        newOrientation ?? new TgdQuat(),
      );
      const morphoWidth = Math.max(1e-6, Math.abs(sx));
      const morphoHeight = Math.max(1e-6, Math.abs(sy));
      this.morphoWidthAtTarget = morphoWidth;
      this.morphoHeightAtTarget = morphoHeight;
      camera.fitSpaceAtTarget(morphoWidth, morphoHeight);
      camera.zoom = 0.1;
      context.animSchedule({
        action: tgdActionCreateCameraInterpolation(camera, {
          zoom: 1,
          position: nodes.center,
          orientation: newOrientation,
        }),
        duration: transition,
        easingFunction: tgdEasingFunctionInOutCubic,
      });
    } else {
      camera.transfo.orientation.face("+X+Y+Z");
    }
    context.paint();
  };

  computeScalebar(options: Partial<ScalebarOptions> = {}) {
    return computeScalebarAttributes(this.pixelScale, options);
  }

  get colorBy() {
    return this.painter?.colorBy ?? this._colorBy;
  }
  set colorBy(value: ColoringType) {
    if (this._colorBy === value) return;

    const { painter } = this;
    this._colorBy = value;
    if (painter) {
      painter.colorBy = value;
      this.paint();
    }
  }

  get radiusType() {
    return this.painter?.radiusType ?? this._radiusType;
  }

  set radiusType(value) {
    if (this._radiusType === value) return;

    const { painter } = this;
    this._radiusType = value;
    if (painter) {
      painter.radiusType = value;
      this.paint();
    }
  }

  get radiusMultiplier() {
    return this.painter?.radiusMultiplier ?? this._radiusMultiplier;
  }
  set radiusMultiplier(value) {
    if (this._radiusMultiplier === value) return;

    const { painter } = this;
    this._radiusMultiplier = value;
    if (painter) {
      painter.radiusMultiplier = value;
      this.paint();
    }
  }

  get swc() {
    return this._swc;
  }
  set swc(swc: string | null) {
    if (swc === this._swc) {
      // This content is already loaded.
      return;
    }

    this._swc = swc;
    this.nodesManager = null;
    if (swc) {
      this.nodes = parseSwc(swc);
    }
  }

  get nodes() {
    return this._nodes;
  }
  set nodes(nodes: CellNode[]) {
    this._nodes = nodes;
    const nodesManager = new CellNodes(nodes);
    this._maxDendriteLength = nodesManager.computeDistancesFromSoma();
    this.nodesManager = nodesManager;
    this.init();
  }

  public readonly paint = () => {
    const { context } = this;
    if (!context) return;

    context.paint();
  };

  private readonly handleColorsChange = () => {
    const { colors, customColorsForSection, customColorsForDistance } = this;
    this.painter?.resetColors(
      colors,
      customColorsForSection,
      customColorsForDistance,
    );
    this.eventColorsChange.dispatch({
      apicalDendrite: colors.apicalDendrite,
      axon: colors.axon,
      background: colors.background,
      basalDendrite: colors.basalDendrite,
      soma: colors.soma,
    });
    this.resetClearColor();
    if (this.material) {
      const rgba = colorToRGBA(this.colors.soma, 1);
      //   this.material.texture  .color = new TgdVec4(...rgba);
    }
    this.paint();
  };

  private resetClearColor() {
    const { clear, colors } = this;
    if (clear) {
      const [red, green, blue, alpha] = colorToRGBA(colors.background);
      clear.red = red;
      clear.green = green;
      clear.blue = blue;
      clear.alpha = alpha;
    }
  }

  protected init() {
    const { canvas, nodesManager: nodes, context } = this;
    if (!canvas || !nodes || !context) return;

    this.resetCamera();
    context.removeAll();
    const clear = new TgdPainterClear(context, {
      color: [0, 0, 0, 1],
      depth: 1,
    });
    this.clear = clear;
    this.resetClearColor();
    const depth = new TgdPainterDepth(context, {
      enabled: true,
      func: "LESS",
      mask: true,
      rangeMin: 0,
      rangeMax: 1,
    });
    const segments = new SwcPainter(context, nodes);
    segments.minRadius = this._minRadius;
    if (this.colors)
      segments.resetColors(
        this.colors,
        this.customColorsForSection,
        this.customColorsForDistance,
      );
    this.painter = segments;
    context.add(
      new TgdPainterLogic(() => {
        context.camera.fitSpaceAtTarget(
          this.morphoWidthAtTarget,
          this.morphoHeightAtTarget,
        );
      }),
      clear,
      depth,
      this.painter,
    );
    const { orbiter } = this;
    if (orbiter) orbiter.onZoomRequest = this.handleZoomRequest;
  }

  /**
   * We accept the zoom only if the canvas is in fullscreen
   * or if the Ctrl key is pressed.
   */
  private readonly handleZoomRequest = (
    evt: TgdControllerCameraOrbitZoomRequest,
  ): boolean => {
    const { context } = this;
    if (!context) return false;

    const { canvas } = context.gl;
    if (canvas instanceof HTMLCanvasElement && tgdFullscreenTest(canvas)) {
      return true;
    }

    return evt.ctrlKey;
  };
}

function computeBoundingBox(
  nodes: CellNodes,
  orientation: Readonly<TgdQuat>,
): [number, number] {
  let x = 0;
  let y = 0;
  const mat = new TgdMat3().fromQuat(orientation).transpose();
  const vec = new TgdVec3();
  nodes.forEach((node) => {
    vec.reset(node.x, node.y, node.z).subtract(nodes.center).applyMatrix(mat);
    x = Math.max(x, Math.abs(vec.x));
    y = Math.max(y, Math.abs(vec.y));
  });
  return [x, y];
}
