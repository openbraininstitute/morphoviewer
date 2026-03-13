/* eslint-disable no-param-reassign */

import { TgdVec4, tgdCalcMapRange } from "@tolokoban/tgd";
import React from "react";

import { getColorFromGeneratedPalette } from "../../colors";

import type { PainterManager } from "../../painter";

export interface LegendTarget {
  section: string;
  origin: "injection" | "recording";
  offset: number;
  color?: string | undefined;
}

interface LabelToDraw {
  originX: number;
  originY: number;
  tipX: number;
  tipY: number;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  text: string;
  color: string;
  isInjection: boolean;
}

const FONTSIZE = 16;
const MARGIN_TOP = 8;
const MARGIN_RIGHT = 8;
const MARGIN_BOTTOM = 48;
const MARGIN_LEFT = 8;
const PADDING = 8;

export class LegendPainter {
  private canvas: HTMLCanvasElement | null = null;

  private ctx: CanvasRenderingContext2D | null = null;

  private targets: LegendTarget[] = [];

  constructor(private readonly painterManager: PainterManager) {
    painterManager.eventPaint.addListener(this.repaint);
  }

  private readonly repaint = () => {
    requestAnimationFrame(() => this.paint(this.canvas, this.targets));
  };

  paint(canvas: HTMLCanvasElement | null, targets: LegendTarget[]) {
    this.targets = targets;
    const ctx = this.getContext(canvas);
    if (!ctx || !canvas) return;

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `bold ${FONTSIZE}px sans-serif`;
    const { painterManager } = this;
    const labels: LabelToDraw[] = [];
    let targetIndex = -1;
    for (const target of targets) {
      targetIndex++;
      const sectionId = target.section;
      const segment = painterManager.getSegment(sectionId, target.offset);
      if (!segment) continue;

      const tip = new TgdVec4(
        painterManager.getSectionCoordinates(sectionId, target.offset),
        1,
      ).applyMatrix(painterManager.getCameraMatrix());
      tip.scale(1 / tip.w);
      const isInjection = target.origin === "injection";
      const text = target.section;
      const measure = ctx.measureText(text);
      labels.push({
        originX: tip.x,
        originY: tip.y,
        text,
        color: isInjection ? "#fff" : (target.color ?? getColorFromGeneratedPalette(targetIndex)),
        tipX: round(tgdCalcMapRange(tip.x, -1, +1, 0, canvas.width)),
        tipY: round(tgdCalcMapRange(tip.y, +1, -1, 0, canvas.height)),
        boxX: 0,
        boxY: 0,
        boxW: round(PADDING * 2 + measure.width + (isInjection ? FONTSIZE * 1.5 : 0)),
        boxH: round(PADDING * 2 + FONTSIZE),
        isInjection,
      });
    }

    for (const label of spreadLabels(labels, canvas.width, canvas.height)) {
      drawLabel(ctx, label);
    }
  }

  private getContext(canvas: HTMLCanvasElement | null) {
    if (canvas !== this.canvas) {
      this.canvas = canvas;
      if (canvas) {
        this.ctx = canvas.getContext("2d");
        if (this.ctx) {
          this.ctx.font = `bold ${FONTSIZE}px sans-serif`;
        }
      }
    }
    return this.ctx;
  }
}

export function useLegendPainter(painterManager: PainterManager): LegendPainter {
  const ref = React.useRef<LegendPainter | null>(null);
  if (!ref.current) ref.current = new LegendPainter(painterManager);
  return ref.current;
}

function drawLabel(ctx: CanvasRenderingContext2D, label: LabelToDraw) {
  const r = 8;
  const { text, boxX, boxY, boxW, boxH, tipX, tipY, color, isInjection } = label;
  // Back is all black to help reading the lines.
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(tipX, tipY, r, r, 0, 0, 2 * Math.PI);
  ctx.stroke();
  if (boxX > 0) {
    if (isInjection) {
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, boxH / 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(boxX, boxY, boxW, boxH);
    }
  }
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(round(boxX + boxW / 2), round(boxY + boxH / 2));
  ctx.stroke();
  // Front with colors.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(tipX, tipY, r, r, 0, 0, 2 * Math.PI);
  ctx.fill();
  if (boxX > 0) {
    if (isInjection) {
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, boxH / 2);
      ctx.fill();
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(boxX, boxY, boxW, boxH);
    }
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(round(boxX + boxW / 2), round(boxY + boxH / 2));
  ctx.stroke();
  ctx.font = `bold ${FONTSIZE}px sans-serif`;
  const measure = ctx.measureText(text);
  ctx.fillStyle = "#000";
  const fontHeight = measure.emHeightAscent ?? measure.actualBoundingBoxAscent ?? FONTSIZE;
  ctx.fillText(text, boxX + PADDING, boxY + PADDING + fontHeight);
  if (isInjection) {
    // Draw little bolt
    const s = FONTSIZE;
    const x = boxX + boxW - s;
    const y = boxY + PADDING;
    ctx.fillStyle = "#ff0";
    ctx.strokeStyle = "#000";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + s * 0.4);
    ctx.lineTo(x + s / 3, y + s * 0.4);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x, y + s * 0.6);
    ctx.lineTo(x - s / 3, y + s * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * To not have bluring on single pixels in Canvas 2D,
 * we must place elements at coordinates that are
 * integers + 0.5
 * @param value
 * @returns
 */
function round(value: number) {
  return Math.round(value) + 0.5;
}

/**
 * We split the labels in four categories: top-left, top-right, bottom-left and bottom-right.
 * And we distribute the labels to fill the space in each category.
 * @param labels
 * @param width
 * @param height
 */
function spreadLabels(labels: LabelToDraw[], width: number, height: number) {
  const topLeft: LabelToDraw[] = [];
  const topRight: LabelToDraw[] = [];
  const bottomLeft: LabelToDraw[] = [];
  const bottomRight: LabelToDraw[] = [];
  // We set the center slightly off to force the soma label to always
  // be in the bottom right corner.
  const centerX = -1e-3;
  const centerY = 1e-3;
  for (const label of labels) {
    if (label.originX < centerX) {
      // Left
      if (label.originY < centerY) bottomLeft.push(label);
      else topLeft.push(label);
    } else {
      // Right
      // eslint-disable-next-line no-lonely-if
      if (label.originY < centerY) bottomRight.push(label);
      else topRight.push(label);
    }
  }
  const sorter = ({ originY: a }: LabelToDraw, { originY: b }: LabelToDraw) => b - a;
  topLeft.sort(sorter);
  bottomLeft.sort(sorter);
  topRight.sort(sorter);
  bottomRight.sort(sorter);

  const halfH = height / 2;
  let index = 0;
  let space = (halfH - MARGIN_TOP - MARGIN_BOTTOM) / topLeft.length;
  for (const label of topLeft) {
    label.boxX = MARGIN_LEFT;
    label.boxY = round((index + 0.5) * space);
    index++;
  }
  index = 0;
  space = (halfH - MARGIN_TOP - MARGIN_BOTTOM) / bottomLeft.length;
  for (const label of bottomLeft) {
    label.boxX = MARGIN_LEFT;
    label.boxY = round(halfH + (index + 0.5) * space);
    index++;
  }
  index = 0;
  space = (halfH - MARGIN_TOP - MARGIN_BOTTOM) / topRight.length;
  for (const label of topRight) {
    label.boxX = width - MARGIN_RIGHT - label.boxW;
    label.boxY = round((index + 0.5) * space);
    index++;
  }
  index = 0;
  space = (halfH - MARGIN_TOP - MARGIN_BOTTOM) / bottomRight.length;
  for (const label of bottomRight) {
    label.boxX = width - MARGIN_RIGHT - label.boxW;
    label.boxY = round(halfH + (index + 0.5) * space);
    index++;
  }

  return [...topLeft, ...topRight, ...bottomLeft, ...bottomRight];
}
