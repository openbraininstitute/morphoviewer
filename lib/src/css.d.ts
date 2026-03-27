import type * as CSS from "csstype"

declare module "csstype" {
    interface Properties extends CSSProperties {
        /**
         * Allow namespaced CSS Custom Properties.
         * Example:
         *   <div style={{ "--custom-size": "64px" }}>...</div>
         */
        [index: `--theme-${string}` | `--custom-${string}`]: string | number
    }
}
