import type { TgdPainterGizmoOptions } from "@tolokoban/tgd";

export interface PropsForGizmo {
  /**
   * Display the axes controller gizmo.
   * - `false`: do not show the Gizmo
   * - `true`: show it with default options
   * - `Partial<object>`:
   *   - `alignX`: -1 meand left and +1 means right
   *   - `alignY`: -1 meand bottom and +1 means top
   *   - `size`: size of the Gizmo side in pixels
   *   - `margin`: margin from the borders of the viewer (in pixels)
   */
  gizmo?: boolean | TgdPainterGizmoOptions;
}

export interface PropsForScalebar {
  /**
   * If defined, a scalebar will de displayed.
   * You can set a string to specify a className to apply to the scalebar.
   * In this case, you need to set the position/dimension yourself,
   * and you can select the font and the color.
   *
   * Default to `false`.
   */
  scalebar?:
    | boolean
    | string
    | {
        /**
         * If you set a custom classname, you need to set the position/dimension
         * in the CSS file yourself.
         */
        className?: string;
        /**
         * By default the unit is the micro meter (1e-6 meters).
         */
        unit?: number;
      };
}
