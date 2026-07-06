import type { VerticalPaintParams } from "./resolve";

const UNITS = ["m", "mm", "μm", "nm", "pm", "fm"];
const VALUES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 300, 400, 500, 600, 700, 800, 900];

const LABEL_GAP = 4;

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

  // the backing store is sized in device pixels (clientSize * dpr); scale the
  // context so all drawing math stays in CSS pixels and renders crisp on HiDPI
  // TODO: consider using this with the Gizmo too
  const dpr = pixelRatio > 0 ? pixelRatio : 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 2;
  ctx.clearRect(0, 0, w, h);
  const css = globalThis.getComputedStyle(canvas);
  ctx.fillStyle = css.color;
  ctx.strokeStyle = css.color;
  ctx.font = `${css.fontSize} ${css.fontFamily}`;

  if (orientation === "vertical" && vertical) {
    ctx.fillStyle = vertical.color;
    ctx.strokeStyle = vertical.color;
    ctx.lineWidth = vertical.thickness;
    paintVertical(ctx, w, h, spacePerPixel, unitFactor, vertical);
    return;
  }

  const minStepWidth = 3 * ctx.measureText("999 mm").width;
  const { unitText, width, value } = computeBestFit(w, spacePerPixel, unitFactor, minStepWidth);
  let step = 0;
  for (let stepX0 = 0; stepX0 + width < w; stepX0 += width) {
    const stepX1 = stepX0 + width;
    step++;
    const text = `${value * step} ${unitText} `;
    const measure = ctx.measureText(text);
    const y = Math.round(measure.actualBoundingBoxAscent + measure.actualBoundingBoxDescent) + 0.5;
    const x = Math.round(stepX1 - (width + measure.width) / 2) + 0.5;
    ctx.fillText(text, x, y);
    const x0 = Math.round(stepX0) + 0.5;
    const x1 = Math.round(stepX1) + 0.5;
    const yy = h - measure.actualBoundingBoxAscent;
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
 * draw the scalebar as a compact vertical ruler
 */
function paintVertical(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  spacePerPixel: number,
  unitFactor: number,
  params: VerticalPaintParams
) {
  const { anchor, outerReserve, majorLength, minorLength, minorPerMajor } = params;
  const sample = ctx.measureText("999 mm");
  const textHeight = sample.actualBoundingBoxAscent + sample.actualBoundingBoxDescent;
  const minStepHeight = 3 * textHeight;
  const {
    unitText,
    width: majorStep,
    value,
  } = computeBestFit(h, spacePerPixel, unitFactor, minStepHeight);
  const minorStep = majorStep / minorPerMajor;
  if (!Number.isFinite(minorStep) || minorStep <= 0) return;

  // the holder hugs the anchored edge at a fixed inset, so it never shifts
  const xBase = anchor === "left" ? outerReserve + 0.5 : Math.round(w) - outerReserve - 0.5;

  ctx.beginPath();
  ctx.moveTo(xBase, 0);
  ctx.lineTo(xBase, h);
  ctx.stroke();

  let i = 0;
  for (let y = h; y >= -0.5; y -= minorStep) {
    const isMajor = i % minorPerMajor === 0;
    const len = isMajor ? majorLength : minorLength;
    const yy = Math.round(y) + 0.5;
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
    // labels: majors only, and only when they fit fully (no clipping).
    if (params.labels && isMajor && i > 0 && yy - textHeight >= 0 && yy + textHeight <= h) {
      const step = i / minorPerMajor;
      const text = `${value * step} ${unitText}`;
      const ty = yy + textHeight / 2 - sample.actualBoundingBoxDescent;
      if (params.labelSide === "right") {
        ctx.textAlign = "left";
        ctx.fillText(text, xBase + majorLength + LABEL_GAP, ty);
      } else {
        ctx.textAlign = "right";
        ctx.fillText(text, xBase - majorLength - LABEL_GAP, ty);
      }
    }
    i++;
    if (i > 200) break;
  }
  ctx.textAlign = "start";
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
