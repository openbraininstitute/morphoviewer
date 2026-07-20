import {
  type TgdContext,
  TgdPainterGroup,
  TgdPainterPointsCloud,
  TgdTexture2D,
  tgdCanvasCreatePalette,
} from "@tolokoban/tgd";

import type { MorphoViewerWorldOverlay } from "../components/types";

/** Minimal shape of TgdPainterPointsCloud private fields we need for live updates. */
type PointsCloudInternals = {
  dataPoint: Float32Array;
  vao: {
    datasets?: ReadonlyArray<{
      data: ArrayBuffer;
      set: (name: string, data: Float32Array) => void;
    }>;
    updateDataset: (dataset: unknown) => boolean;
    getBuffer?: (index: number) => {
      bind: () => void;
      bufferData: (opts: { data: ArrayBufferView; usage?: string }) => void;
    };
  };
};

/**
 * Multi-colour world-space point overlays (electrodes, markers, …).
 * Synapses use a separate painter — keep the two APIs separate.
 *
 * How:
 * - Full rebuild when group count / colours / point counts change
 * - {@link PainterWorldOverlays.syncPositions} rewrites XYZ in the existing GPU
 *   buffer during drag (no dispose) so markers stay under the cursor
 * - Flat opaque discs (`fragCodeFlat`) + host `blend: "off"` so electrodes do
 *   not inherit neuron alpha blending
 *
 * Why point clouds: dense contact sites are cheaper as instanced billboards
 * than as individual meshes.
 */
export class PainterWorldOverlays extends TgdPainterGroup {
  private readonly texture: TgdTexture2D;
  private _overlays: MorphoViewerWorldOverlay[] = [];
  private painter: TgdPainterPointsCloud | null = null;
  private dataPoint: Float32Array | null = null;
  /** Reused interleaved upload scratch (avoids alloc per drag frame). */
  private uploadScratch: Float32Array | null = null;
  private _radius = 5;
  private _minRadiusInPixels = 4;
  private _highlightedId: string | null = null;

  constructor(public readonly context: TgdContext) {
    super({ name: "PainterWorldOverlays" });
    this.texture = new TgdTexture2D(context, {
      params: {
        magFilter: "NEAREST",
        minFilter: "NEAREST",
      },
    });
  }

  get radius(): number {
    return this._radius;
  }
  set radius(radius: number) {
    if (this._radius === radius) return;

    this._radius = radius;
    const { painter } = this;
    if (painter) {
      painter.radiusMultiplier = radius;
      this.context.paint();
    }
  }

  get minRadiusInPixels(): number {
    return this._minRadiusInPixels;
  }
  set minRadiusInPixels(minRadiusInPixels: number) {
    if (this._minRadiusInPixels === minRadiusInPixels) return;

    this._minRadiusInPixels = minRadiusInPixels;
    const { painter } = this;
    if (painter) {
      painter.minSizeInPixels = minRadiusInPixels;
      this.context.paint();
    }
  }

  get highlightedId(): string | null {
    return this._highlightedId;
  }
  set highlightedId(highlightedId: string | null) {
    if (this._highlightedId === highlightedId) return;
    this._highlightedId = highlightedId;
    // Highlight changes palette / per-point scale → full rebuild.
    this.rebuild();
  }

  get overlays(): MorphoViewerWorldOverlay[] {
    return this._overlays;
  }
  set overlays(overlays: MorphoViewerWorldOverlay[]) {
    if (sameOverlayTopology(this._overlays, overlays) && this.painter && this.dataPoint) {
      this._overlays = overlays;
      this.syncPositions();
      return;
    }

    this._overlays = overlays;
    this.rebuild();
  }

  /**
   * Fast path for drag: rewrite XYZ (+ highlight scale) into the existing GPU
   * buffer and paint once. Prefer this over assigning `overlays` mid-gesture.
   */
  syncPositions() {
    const { dataPoint, painter } = this;
    if (!dataPoint || !painter) return;
    writePositions(dataPoint, this._overlays, this._highlightedId);
    this.uploadPositions();
  }

  /**
   * Upload `dataPoint` into the points-cloud VAO without reallocating attributes.
   * Falls back to {@link rebuild} if the buffer layout is unavailable.
   */
  private uploadPositions() {
    const { painter, dataPoint, context } = this;
    if (!painter || !dataPoint) return;

    const internals = painter as unknown as PointsCloudInternals;
    const dataset = internals.vao?.datasets?.[0];
    if (!dataset) {
      this.rebuild();
      return;
    }
    // Avoid TgdDataset.set's per-vertex Uint8 copies — write floats directly
    // into the interleaved buffer (attPoint vec4 + attUV vec2 → stride 6).
    const floats = dataset.data.byteLength >> 2;
    let interleaved = this.uploadScratch;
    if (!interleaved || interleaved.length !== floats) {
      interleaved = new Float32Array(floats);
      this.uploadScratch = interleaved;
    }
    // Share storage with the VAO dataset when possible (zero-copy path).
    const shared = new Float32Array(dataset.data);
    const target = shared.length === floats ? shared : interleaved;
    const stride = target.length === dataPoint.length ? 4 : 6;
    if (stride === 4) {
      target.set(dataPoint);
    } else {
      const count = dataPoint.length >> 2;
      for (let i = 0; i < count; i++) {
        const src = i * 4;
        const dst = i * stride;
        target[dst] = dataPoint[src];
        target[dst + 1] = dataPoint[src + 1];
        target[dst + 2] = dataPoint[src + 2];
        target[dst + 3] = dataPoint[src + 3];
      }
    }
    const buffer = internals.vao.getBuffer?.(0);
    if (buffer) {
      // bufferSubData keeps GPU allocation; bufferData reallocates every frame.
      const { gl } = context;
      buffer.bind();
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, target);
    } else {
      dataset.set("attPoint", dataPoint);
      internals.vao.updateDataset(dataset);
    }
    context.paint();
  }

  /**
   * Recreate palette texture + points cloud (topology / colour / highlight change).
   * Uses flat opaque fragments so markers stay solid over translucent neurons.
   */
  private rebuild() {
    const { overlays } = this;
    this.removeAll();
    this.painter = null;
    this.dataPoint = null;
    this.uploadScratch = null;
    if (overlays.length > 0) {
      const palette = overlays.map((overlay) =>
        forceOpaque(
          overlay.id && overlay.id === this._highlightedId
            ? highlightColor(overlay.color)
            : overlay.color
        )
      );
      this.texture.loadBitmap(tgdCanvasCreatePalette(palette));
      const attXYZR: number[] = [];
      const attUV: number[] = [];
      for (let indexGroup = 0; indexGroup < overlays.length; indexGroup++) {
        const group = overlays[indexGroup];
        const highlighted = Boolean(group.id && group.id === this._highlightedId);
        const scale = highlighted ? 1.55 : 1;
        const u = (indexGroup + 0.5) / overlays.length;
        for (let indexCoords = 0; indexCoords < group.coordinates.length; indexCoords += 3) {
          const x = group.coordinates[indexCoords + 0];
          const y = group.coordinates[indexCoords + 1];
          const z = group.coordinates[indexCoords + 2];
          attXYZR.push(x, y, z, scale);
          attUV.push(u, 0.5);
        }
      }
      const dataPoint = new Float32Array(attXYZR);
      this.dataPoint = dataPoint;
      const painter = new TgdPainterPointsCloud(this.context, {
        dataPoint,
        dataUV: new Float32Array(attUV),
        texture: this.texture,
        radiusMultiplier: this.radius,
        minSizeInPixels: this.minRadiusInPixels,
        // Flat discs — solid colour, no lit sphere shading that reads as translucent.
        fragCode: TgdPainterPointsCloud.fragCodeFlat(),
      });
      this.painter = painter;
      this.add(painter);
    }
    this.context.paint();
  }
}

/** Brighten a CSS colour toward white for hover/drag highlight feedback. */
function highlightColor(color: string): string {
  return mixTowardWhite(color, 0.55);
}

/**
 * Force opaque RGB for the palette texel.
 * Why: host may pass rgba for selection styling; alpha would show the circuit through markers.
 */
function forceOpaque(color: string): string {
  const rgb = parseCssColor(color);
  if (!rgb) return color;
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function mixTowardWhite(color: string, amount: number): string {
  const rgb = parseCssColor(color);
  if (!rgb) return "#ffffff";
  const t = Math.min(1, Math.max(0, amount));
  const r = Math.round(rgb[0] + (255 - rgb[0]) * t);
  const g = Math.round(rgb[1] + (255 - rgb[1]) * t);
  const b = Math.round(rgb[2] + (255 - rgb[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function parseCssColor(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      return [
        Number.parseInt(h[0] + h[0], 16),
        Number.parseInt(h[1] + h[1], 16),
        Number.parseInt(h[2] + h[2], 16),
      ];
    }
    return [
      Number.parseInt(h.slice(0, 2), 16),
      Number.parseInt(h.slice(2, 4), 16),
      Number.parseInt(h.slice(4, 6), 16),
    ];
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(color.trim());
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return null;
}

/**
 * True when only XYZ may differ — safe to {@link PainterWorldOverlays.syncPositions}
 * instead of a full rebuild.
 */
function sameOverlayTopology(
  a: MorphoViewerWorldOverlay[],
  b: MorphoViewerWorldOverlay[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].color !== b[i].color) return false;
    if (a[i].id !== b[i].id) return false;
    if (a[i].coordinates.length !== b[i].coordinates.length) return false;
  }
  return true;
}

/** Write XYZ into the existing `[x,y,z,r,…]` buffer. */
function writePositions(
  dataPoint: Float32Array,
  overlays: MorphoViewerWorldOverlay[],
  highlightedId: string | null
): void {
  let offset = 0;
  for (const group of overlays) {
    const scale = group.id && group.id === highlightedId ? 1.55 : 1;
    const coords = group.coordinates;
    for (let i = 0; i < coords.length; i += 3) {
      dataPoint[offset] = coords[i];
      dataPoint[offset + 1] = coords[i + 1];
      dataPoint[offset + 2] = coords[i + 2];
      dataPoint[offset + 3] = scale;
      offset += 4;
    }
  }
}
