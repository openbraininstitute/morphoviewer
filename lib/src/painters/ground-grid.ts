import {
  type TgdContext,
  TgdPainterAxes,
  TgdPainterGroup,
  TgdPainterLines,
  TgdPainterState,
  TgdTexture2D,
  tgdCanvasCreatePalette,
} from "@tolokoban/tgd";

export interface GroundGridBounds {
  /** World X extent [min, max] */
  xMin: number;
  xMax: number;
  /** Floor height (Y-up world). */
  y: number;
  /** World Z extent [min, max] */
  zMin: number;
  zMax: number;
}

/** Palette slots for {@link TgdPainterLines} `u` sampling. */
const U = {
  minor: 0.5 / 6,
  major: 1.5 / 6,
  axisX: 2.5 / 6,
  axisY: 3.5 / 6,
  axisZ: 4.5 / 6,
  drop: 5.5 / 6,
} as const;

/**
 * Measurement ground plane for electrode placement (XZ floor, Y up).
 *
 * - Minor / major grid lines snapped through world 0
 * - RGB world axes through the origin (X red, Y green, Z blue)
 * - Optional vertical drop lines from markers down to the floor (reads height)
 *
 * Spacing follows the scalebar `spacePerPixel` stream.
 */
export class PainterGroundGrid extends TgdPainterGroup {
  private _enabled = false;
  private _context: TgdContext | null = null;
  private _linePainter: TgdPainterLines | null = null;
  private _axesPainter: TgdPainterAxes | null = null;
  private _texture: TgdTexture2D | null = null;
  private _bounds: GroundGridBounds | null = null;
  private _step = 100;
  private _markers: Float32Array | number[] = [];

  constructor() {
    super({ name: "PainterGroundGrid" });
  }

  get enabled(): boolean {
    return this._enabled;
  }
  set enabled(enabled: boolean) {
    if (this._enabled === enabled) return;

    this._enabled = enabled;
    this.rebuild();
  }

  get context(): TgdContext | null {
    return this._context;
  }
  set context(context: TgdContext | null) {
    if (context === this._context) return;

    this.disposePainter();
    this._context = context;
    this.rebuild();
  }

  /** Current minor-step in world units (µm). */
  get step(): number {
    return this._step;
  }

  /**
   * Update floor plane, spacing, and optional marker points (for drop lines)
   * in a single rebuild. No-ops when nothing meaningful changed — critical so
   * orbit/zoom paint loops do not rebuild geometry every frame.
   */
  setLayout(
    bounds: GroundGridBounds | null,
    step: number,
    markers: Float32Array | number[] = this._markers
  ) {
    const nextStep = Number.isFinite(step) && step > 0 ? step : this._step;
    const boundsChanged = !sameBounds(this._bounds, bounds);
    const stepChanged = nextStep !== this._step;
    const markersChanged = !sameMarkers(this._markers, markers);
    if (!boundsChanged && !stepChanged && !markersChanged) return;

    this._bounds = bounds;
    this._step = nextStep;
    this._markers = markers;
    this.rebuild();
  }

  setBounds(bounds: GroundGridBounds | null) {
    this.setLayout(bounds, this._step, this._markers);
  }

  /** Update only spacing (used on zoom / spacePerPixel). Cheap no-op when unchanged. */
  setStep(step: number) {
    if (!Number.isFinite(step) || step <= 0 || step === this._step) return;
    this._step = step;
    this.rebuild();
  }

  setMarkers(markers: Float32Array | number[]) {
    if (sameMarkers(this._markers, markers)) return;
    this._markers = markers;
    this.rebuild();
  }

  private rebuild() {
    this.disposePainter();
    const context = this._context;
    const bounds = this._bounds;
    if (!this._enabled || !context || !bounds) return;

    const majorStep = this._step * 5;
    const axisLength = Math.max(majorStep * 2, this._step * 8);
    const dataPoint = buildGridGeometry(bounds, this._step, majorStep, axisLength, this._markers);
    if (dataPoint.length < 8) return;

    const texture = new TgdTexture2D(context, {
      params: { magFilter: "NEAREST", minFilter: "NEAREST" },
    }).loadBitmap(
      tgdCanvasCreatePalette([
        "rgba(148,163,184,0.35)", // minor
        "rgba(71,85,105,0.75)", // major
        "#ef4444", // +X
        "#22c55e", // +Y
        "#3b82f6", // +Z
        "rgba(249,115,22,0.85)", // drop lines (orange, reads against electrodes)
      ])
    );
    this._texture = texture;

    const linePainter = new TgdPainterLines(context, { dataPoint, texture });
    this._linePainter = linePainter;

    const children: Array<TgdPainterLines | TgdPainterAxes> = [linePainter];
    // Compact RGB triad only when world origin sits on this floor patch — avoids
    // a distant origin triad that makes orbit feel like tumbling all of space.
    const originOnFloor =
      0 >= bounds.xMin - this._step &&
      0 <= bounds.xMax + this._step &&
      0 >= bounds.zMin - this._step &&
      0 <= bounds.zMax + this._step;
    if (originOnFloor) {
      const axes = new TgdPainterAxes(context, {
        x: 0,
        y: bounds.y,
        z: 0,
        scale: axisLength,
      });
      this._axesPainter = axes;
      children.push(axes);
    } else {
      this._axesPainter = null;
    }

    // Depth-less so the reference frame stays readable through translucent neurons.
    this.add(
      new TgdPainterState(context, {
        depth: "off",
        blend: "alpha",
        children,
      })
    );
    context.paint();
  }

  private disposePainter() {
    this.removeAll(true);
    this._linePainter = null;
    this._axesPainter = null;
    this._texture?.delete();
    this._texture = null;
  }
}

/** Target on-screen gap between minor grid lines (CSS px). */
export const GROUND_GRID_TARGET_SCREEN_PX = 36;

/**
 * Nice 1/2/5×10ⁿ world step from camera `spacePerPixel` (same stream as the scalebar).
 */
export function resolveGroundGridStep(
  spacePerPixel: number,
  targetScreenPx = GROUND_GRID_TARGET_SCREEN_PX
): number {
  if (!(Number.isFinite(spacePerPixel) && spacePerPixel > 0)) return 100;
  const raw = targetScreenPx * spacePerPixel;
  if (!(raw > 0)) return 100;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const mantissa = raw / base;
  const nice = mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * Floor bounds from the scene bbox (+ optional markers). Stays local to the
 * circuit so orbit remains centered on the model — do not force-include world
 * origin (that stretched the grid across empty space and made rotation feel
 * like tumbling the universe).
 */
export function boundsFromBBox(
  min: readonly [number, number, number],
  max: readonly [number, number, number],
  marginFactor = 0.2,
  markers?: Float32Array | number[]
): GroundGridBounds | null {
  if (!(min[0] <= max[0] && min[1] <= max[1] && min[2] <= max[2])) return null;

  let xMin = min[0];
  let xMax = max[0];
  let zMin = min[2];
  let zMax = max[2];
  let yFloor = min[1];

  if (markers) {
    for (let i = 0; i + 2 < markers.length; i += 3) {
      xMin = Math.min(xMin, markers[i]);
      xMax = Math.max(xMax, markers[i]);
      yFloor = Math.min(yFloor, markers[i + 1]);
      zMin = Math.min(zMin, markers[i + 2]);
      zMax = Math.max(zMax, markers[i + 2]);
    }
  }

  const dx = xMax - xMin;
  const dz = zMax - zMin;
  if (dx <= 0 && dz <= 0) {
    const pad = 100;
    const cx = (xMin + xMax) / 2;
    const cz = (zMin + zMax) / 2;
    return {
      xMin: cx - pad,
      xMax: cx + pad,
      y: yFloor,
      zMin: cz - pad,
      zMax: cz + pad,
    };
  }

  const mx = Math.max(dx, 50) * marginFactor;
  const mz = Math.max(dz, 50) * marginFactor;
  return {
    xMin: xMin - mx,
    xMax: xMax + mx,
    y: yFloor,
    zMin: zMin - mz,
    zMax: zMax + mz,
  };
}

/** Flatten overlay groups into xyz triples for drop lines / bounds. */
export function flattenOverlayMarkers(
  overlays: ReadonlyArray<{ coordinates: Float32Array | number[] }> | null | undefined
): number[] {
  if (!overlays?.length) return [];
  const out: number[] = [];
  for (const group of overlays) {
    const c = group.coordinates;
    for (let i = 0; i + 2 < c.length; i += 3) {
      out.push(c[i], c[i + 1], c[i + 2]);
    }
  }
  return out;
}

function sameBounds(a: GroundGridBounds | null, b: GroundGridBounds | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.xMin === b.xMin &&
    a.xMax === b.xMax &&
    a.y === b.y &&
    a.zMin === b.zMin &&
    a.zMax === b.zMax
  );
}

function sameMarkers(a: Float32Array | number[], b: Float32Array | number[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function pushLine(
  points: number[],
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  u: number
) {
  points.push(x0, y0, z0, u, x1, y1, z1, u);
}

/**
 * Build measurement geometry: minor/major XZ grid local to the circuit,
 * short RGB triad at world origin when it lies on the floor patch, and drop
 * lines from markers to the floor.
 */
function buildGridGeometry(
  bounds: GroundGridBounds,
  step: number,
  majorStep: number,
  axisLength: number,
  markers: Float32Array | number[]
): Float32Array {
  const { xMin, xMax, y, zMin, zMax } = bounds;
  const points: number[] = [];

  const startX = Math.floor(xMin / step) * step;
  const startZ = Math.floor(zMin / step) * step;

  for (let x = startX; x <= xMax + step * 0.5; x += step) {
    if (x < xMin - step * 0.01) continue;
    const isZero = Math.abs(x) < step * 1e-6;
    const isMajor = Math.abs(Math.round(x / majorStep) * majorStep - x) < step * 1e-6;
    // x=0 gets axis colour below; skip duplicate grey line.
    if (isZero) continue;
    const u = isMajor ? U.major : U.minor;
    pushLine(points, x, y, zMin, x, y, zMax, u);
  }

  for (let z = startZ; z <= zMax + step * 0.5; z += step) {
    if (z < zMin - step * 0.01) continue;
    const isZero = Math.abs(z) < step * 1e-6;
    const isMajor = Math.abs(Math.round(z / majorStep) * majorStep - z) < step * 1e-6;
    if (isZero) continue;
    const u = isMajor ? U.major : U.minor;
    pushLine(points, xMin, y, z, xMax, y, z, u);
  }

  // Emphasize world X=0 / Z=0 only where they cross this floor patch (no
  // full-space axis spokes — those made orbit feel like tumbling the universe).
  const originOnFloor =
    0 >= xMin - step && 0 <= xMax + step && 0 >= zMin - step && 0 <= zMax + step;
  if (originOnFloor) {
    pushLine(points, 0, y, zMin, 0, y, zMax, U.axisX);
    pushLine(points, xMin, y, 0, xMax, y, 0, U.axisZ);
    // Compact RGB triad at world origin for origin_x/y/z readout.
    pushLine(points, 0, y, 0, axisLength, y, 0, U.axisX);
    pushLine(points, 0, y, 0, -axisLength * 0.35, y, 0, U.axisX);
    pushLine(points, 0, y, 0, 0, y, axisLength, U.axisZ);
    pushLine(points, 0, y, 0, 0, y, -axisLength * 0.35, U.axisZ);
    pushLine(points, 0, y, 0, 0, y + axisLength, 0, U.axisY);
  }

  // Drop lines: marker → floor (reads origin_y / contact height).
  for (let i = 0; i + 2 < markers.length; i += 3) {
    const mx = markers[i];
    const my = markers[i + 1];
    const mz = markers[i + 2];
    if (Math.abs(my - y) < step * 0.01) continue;
    pushLine(points, mx, my, mz, mx, y, mz, U.drop);
    const tick = step * 0.35;
    pushLine(points, mx - tick, y, mz, mx + tick, y, mz, U.drop);
    pushLine(points, mx, y, mz - tick, mx, y, mz + tick, U.drop);
  }

  return new Float32Array(points);
}
