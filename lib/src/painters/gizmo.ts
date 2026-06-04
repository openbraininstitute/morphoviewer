import {
  type TgdContext,
  TgdPainterGizmo,
  type TgdPainterGizmoOptions,
  TgdPainterGroup,
  TgdPainterState,
} from "@tolokoban/tgd";

export class PainterGizmo extends TgdPainterGroup {
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
      this._options = DEFAULT_GIZMO_PROPS;
      return;
    }

    const options = typeof optionsOrBoolean === "boolean" ? DEFAULT_GIZMO_PROPS : optionsOrBoolean;
    this._options = options;
    if (this._painter) {
      this._painter.alignX = options.alignX;
      this._painter.alignY = options.alignY;
      this._painter.size = options.size;
      this._painter.margin = options.margin;
    }
  }

  get context() {
    return this._context;
  }
  set context(context: TgdContext | null) {
    if (context === this._context) return;

    this.removeAll();
    this._context = context;
    if (!context) return;

    const painter = new TgdPainterGizmo(context, this._options);
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

const DEFAULT_GIZMO_PROPS: TgdPainterGizmoOptions = {
  alignX: +1,
  alignY: -1,
  size: 128,
  margin: 8,
};
