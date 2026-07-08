import type { VerticalPaintParams } from "./resolve";

const UNITS = ["m", "mm", "μm", "nm", "pm", "fm"];
const VALUES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 300, 400, 500, 600, 700, 800, 900];

const LABEL_GAP = 4;
/** stroke width (css pixels) of the horizontal bar's bracket */
const HORIZONTAL_THICKNESS = 2;

interface Snapper {
  /** css line width whose device width is a whole number of pixels */
  lineWidth: number;
  /** snap a stroke center so it lands crisply on the physical pixel grid */
  snap(posCss: number): number;
  /** snap a fill/text origin to a whole device pixel */
  snapPoint(posCss: number): number;
}

/**
 * snapping helpers for a given line thickness and devicePixelRatio
 */
function createSnapper(thickness: number, dpr: number): Snapper {
  const widthDevice = Math.max(1, Math.round(thickness * dpr));
  const halfOffset = widthDevice % 2 ? 0.5 : 0;
  return {
    lineWidth: widthDevice / dpr,
    snap: (posCss) => (Math.round(posCss * dpr - halfOffset) + halfOffset) / dpr,
    snapPoint: (posCss) => Math.round(posCss * dpr) / dpr,
  };
}

export function paint(
  canvas: HTMLCanvasElement,
  spacePerPixel: number,
  unitFactor = 1e-6,
  orientation: "horizontal" | "vertical" = "horizontal",
  vertical?: VerticalPaintParams,
  pixelRatio = 1
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = pixelRatio > 0 ? pixelRatio : 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const css = globalThis.getComputedStyle(canvas);
  ctx.fillStyle = css.color;
  ctx.strokeStyle = css.color;
  ctx.font = `${css.fontSize} ${css.fontFamily}`;

  if (orientation === "vertical" && vertical) {
    ctx.fillStyle = vertical.color;
    ctx.strokeStyle = vertical.color;
    paintVertical(ctx, w, h, spacePerPixel, unitFactor, vertical, dpr);
    return;
  }

  paintHorizontal(ctx, w, h, spacePerPixel, unitFactor, dpr);
}

function paintHorizontal(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  spacePerPixel: number,
  unitFactor: number,
  dpr: number
) {
  const { snap, snapPoint, lineWidth } = createSnapper(HORIZONTAL_THICKNESS, dpr);
  ctx.lineWidth = lineWidth;

  const minStepWidth = 3 * ctx.measureText("999 mm").width;
  const { unitText, width, value } = computeBestFit(w, spacePerPixel, unitFactor, minStepWidth);
  let step = 0;
  for (let stepX0 = 0; stepX0 + width < w; stepX0 += width) {
    const stepX1 = stepX0 + width;
    step++;
    const text = `${value * step} ${unitText} `;
    const measure = ctx.measureText(text);
    const y = snapPoint(measure.actualBoundingBoxAscent + measure.actualBoundingBoxDescent);
    const x = snapPoint(stepX1 - (width + measure.width) / 2);
    ctx.fillText(text, x, y);
    const x0 = snap(stepX0);
    const x1 = snap(stepX1);
    const yy = snap(h - measure.actualBoundingBoxAscent);
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.lineTo(x0, h);
    ctx.lineTo(x1, h);
    ctx.lineTo(x1, yy);
    ctx.stroke();
    if (step > 99) break;
  }
}

/**
 * place majors evenly from bottomY to topY so every segment has the same length.
 */
function buildMajorPositions(
  bottomY: number,
  topY: number,
  majorStep: number,
  snap: (y: number) => number
): number[] {
  const span = bottomY - topY;
  const majorCount = Math.max(1, Math.round(span / majorStep));
  const majors: number[] = [];
  for (let m = 0; m <= majorCount; m++) {
    majors.push(snap(bottomY - (m / majorCount) * span));
  }
  return majors;
}

/**
 * draw the scalebar as a compact vertical ruler
 */
function paintVertical(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  spacePerPixel: number,
  unitFactor: number,
  params: VerticalPaintParams,
  dpr: number
) {
  const { anchor, outerReserve, majorLength, minorLength, minorPerMajor } = params;
  const { snap, lineWidth } = createSnapper(params.thickness, dpr);
  ctx.lineWidth = lineWidth;

  const sample = ctx.measureText("999 mm");
  const textHeight = sample.actualBoundingBoxAscent + sample.actualBoundingBoxDescent;
  const minStepHeight = 3 * textHeight;

  const xBase = snap(anchor === "left" ? outerReserve : Math.round(w) - outerReserve);
  const labelPad = params.labels
    ? Math.ceil((sample.actualBoundingBoxAscent + sample.actualBoundingBoxDescent) / 2) + 1
    : 0;
  const topY = snap(labelPad);
  const bottomY = snap(h - labelPad);
  const rulerHeight = bottomY - topY;
  if (rulerHeight <= 0) return;

  const {
    unitText: fitUnitText,
    width: fitMajorStep,
    value: fitValue,
  } = computeBestFit(rulerHeight, spacePerPixel, unitFactor, minStepHeight);
  if (!Number.isFinite(fitMajorStep) || fitMajorStep <= 0) return;
  const majors = buildMajorPositions(bottomY, topY, fitMajorStep, snap);

  ctx.beginPath();
  ctx.moveTo(xBase, topY);
  ctx.lineTo(xBase, bottomY);
  ctx.stroke();

  for (let m = 0; m < majors.length - 1; m++) {
    const lower = majors[m];
    const upper = majors[m + 1];
    const segmentStep = (lower - upper) / minorPerMajor;
    for (let k = 1; k < minorPerMajor; k++) {
      drawPin(ctx, xBase, snap(lower - k * segmentStep), minorLength, params);
    }
  }

  for (let m = 0; m < majors.length; m++) {
    const yy = majors[m];
    drawPin(ctx, xBase, yy, majorLength, params);
    if (params.labels) {
      drawLabel(ctx, params, xBase, majorLength, yy, `${m * fitValue} ${fitUnitText}`);
    }
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawPin(
  ctx: CanvasRenderingContext2D,
  xBase: number,
  yy: number,
  len: number,
  params: VerticalPaintParams
) {
  if (params.leftPins) {
    ctx.beginPath();
    ctx.moveTo(xBase, yy);
    ctx.lineTo(xBase - len, yy);
    ctx.stroke();
  }
  if (params.rightPins) {
    ctx.beginPath();
    ctx.moveTo(xBase, yy);
    ctx.lineTo(xBase + len, yy);
    ctx.stroke();
  }
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  params: VerticalPaintParams,
  xBase: number,
  majorLength: number,
  yy: number,
  text: string
) {
  ctx.textBaseline = "middle";
  const pinOnRight = params.rightPins;
  const pinOnLeft = params.leftPins;
  if (params.labelSide === "right") {
    ctx.textAlign = "left";
    const x = pinOnRight ? xBase + majorLength + LABEL_GAP : xBase + LABEL_GAP;
    ctx.fillText(text, x, yy);
  } else {
    ctx.textAlign = "right";
    const x = pinOnLeft ? xBase - majorLength - LABEL_GAP : xBase - LABEL_GAP;
    ctx.fillText(text, x, yy);
  }
}

function computeBestFit(
  scalebarSize: number,
  spacePerPixel: number,
  unitFactor: number,
  minStepWidth: number
): { unitText: string; width: number; value: number } {
  const steps = Math.max(1, Math.floor(scalebarSize / minStepWidth));
  const stepSize = scalebarSize / steps;
  let stepValue = stepSize * spacePerPixel * unitFactor;
  let unitText = "?";
  let factor = unitFactor;
  for (const candidate of UNITS) {
    unitText = candidate;
    if (stepValue >= 1) break;

    stepValue *= 1e3;
    factor *= 1e3;
  }
  let bestValue = 1;
  for (const candidate of VALUES) {
    if (candidate > stepValue) break;

    bestValue = candidate;
  }
  const width = bestValue / (spacePerPixel * factor);
  return { unitText, width, value: bestValue };
}
