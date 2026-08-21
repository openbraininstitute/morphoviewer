import {
  type TgdContext,
  TgdPainterGizmo,
  type TgdPainterGizmoOptions,
  TgdPainterGroup,
  TgdPainterState,
  type WebglTextureParameters,
} from "@tolokoban/tgd";

export class PainterGizmo extends TgdPainterGroup {
  /** Size and margin in the pixels the context paints at, so `resolution` scales them. */
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
   * The package builds its overlay later, with a margin of zero, and only its `margin`
   * setter reaches it. So the margin has to wait for that overlay to exist.
   */
  private applyMargin(painter: TgdPainterGizmo, margin: number): void {
    if (hasOverlay(painter)) {
      painter.margin = margin;
      return;
    }

    this._context?.execBeforeNextPaint(() => {
      if (this._painter === painter) this.applyMargin(painter, margin);
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

/** The overlay the package's `margin` setter writes to. Private there, so read by shape. */
function hasOverlay(painter: TgdPainterGizmo): boolean {
  return Boolean((painter as unknown as { overlay?: unknown }).overlay);
}

/**
 * Sample the gizmo's framebuffer LINEAR rather than NEAREST.
 *
 * It is drawn back as a quad that rarely lands on a whole pixel, and NEAREST makes that
 * look like stairs. Cast because the texture is private; `setParams` is not.
 */
function smoothGizmoTexture(painter: TgdPainterGizmo): void {
  const { textureFramebuffer } = painter as unknown as {
    textureFramebuffer?: { setParams(parameters: WebglTextureParameters): unknown };
  };
  textureFramebuffer?.setParams({ minFilter: "LINEAR", magFilter: "LINEAR" });
}

/** Gizmo box in the context's pixels. The balls and letters are a fraction of it. */
const DEFAULT_GIZMO_SIZE = 128;
const DEFAULT_GIZMO_MARGIN = 8;

const DEFAULT_GIZMO_PROPS: TgdPainterGizmoOptions = {
  alignX: +1,
  alignY: -1,
  size: DEFAULT_GIZMO_SIZE,
  margin: DEFAULT_GIZMO_MARGIN,
};
