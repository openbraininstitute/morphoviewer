import {
  type TgdContext,
  TgdPainterGizmo,
  type TgdPainterGizmoOptions,
  TgdPainterGroup,
  TgdPainterState,
  type WebglTextureParameters,
} from "@tolokoban/tgd";

export class PainterGizmo extends TgdPainterGroup {
  /** Size and margin in CSS pixels. The package's overlay scales them itself. */
  private _options: TgdPainterGizmoOptions = DEFAULT_GIZMO_PROPS;
  private _context: TgdContext | null = null;
  private _painter: TgdPainterGizmo | null = null;

  get options() {
    return this._options;
  }
  set options(optionsOrBoolean: TgdPainterGizmoOptions | boolean) {
    if (optionsOrBoolean === false) {
      this.removeAll();
      this._painter = null;
      return;
    }

    const options = typeof optionsOrBoolean === "boolean" ? DEFAULT_GIZMO_PROPS : optionsOrBoolean;
    this._options = options;
    if (this._painter) {
      this._painter.alignX = options.alignX;
      this._painter.alignY = options.alignY;
      this._painter.size = options.size;
      this.applyMargin(this._painter, options.margin);
    } else {
      // the painter was disabled (removed) or not built yet — (re)create it so a
      // truthy value always re-enables the gizmo (e.g. after a capture hides it).
      this.createPainter();
    }
  }

  /**
   * Whether a canvas point, in CSS pixels from the top left, is over the gizmo.
   *
   * `alignX` runs -1 (left) to +1 (right), `alignY` +1 (top) to -1 (bottom).
   */
  containsPoint(x: number, y: number, width: number, height: number): boolean {
    if (!this._painter) return false;

    const { alignX, alignY, size, margin } = this._options;
    const box = size - 2 * margin;
    if (box <= 0) return false;

    const left = ((alignX + 1) / 2) * (width - box - 2 * margin) + margin;
    const top = ((1 - alignY) / 2) * (height - box - 2 * margin) + margin;
    return x >= left && x <= left + box && y >= top && y <= top + box;
  }

  get context() {
    return this._context;
  }
  set context(context: TgdContext | null) {
    if (context === this._context) return;

    this.removeAll();
    this._painter = null;
    this._context = context;
    this.createPainter();
  }

  /**
   * Inset the gizmo from its corner.
   *
   * The package builds its overlay asynchronously with a margin of zero, and only the
   * setter reaches it — so this waits, and sets zero first so the setter sees a change.
   */
  private applyMargin(painter: TgdPainterGizmo, margin: number): void {
    painter.margin = 0;
    this._context?.execBeforeNextPaint(() => {
      painter.margin = margin;
    });
  }

  private createPainter() {
    const context = this._context;
    if (!context) return;

    const painter = new TgdPainterGizmo(context, { ...this._options, margin: 0 });
    this.applyMargin(painter, this._options.margin);
    smoothGizmoTexture(painter);
    this._painter = painter;
    this.add(
      new TgdPainterState(context, {
        depth: "off",
        blend: "alpha",
        children: [painter],
      })
    );
  }
}

/**
 * Sample the gizmo's framebuffer LINEAR rather than NEAREST.
 *
 * It is blitted back as a quad that rarely lands on a whole pixel, and NEAREST turns that
 * half pixel into stair-stepping. Cast because the texture is private; `setParams` is not.
 */
function smoothGizmoTexture(painter: TgdPainterGizmo): void {
  const { textureFramebuffer } = painter as unknown as {
    textureFramebuffer?: { setParams(parameters: WebglTextureParameters): unknown };
  };
  textureFramebuffer?.setParams({ minFilter: "LINEAR", magFilter: "LINEAR" });
}

/** Gizmo box in CSS pixels. The balls and their letters are a fraction of it. */
const DEFAULT_GIZMO_SIZE = 56;
const DEFAULT_GIZMO_MARGIN = 10;

const DEFAULT_GIZMO_PROPS: TgdPainterGizmoOptions = {
  alignX: +1,
  alignY: -1,
  size: DEFAULT_GIZMO_SIZE,
  margin: DEFAULT_GIZMO_MARGIN,
};
