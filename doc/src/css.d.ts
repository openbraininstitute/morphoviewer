import "react";
import type * as CSS from "csstype";

declare module "react" {
	interface CSSProperties {
		[key: `--theme-${string}` | `--custom-${string}`]: string | number;
	}
}

declare module "csstype" {
	interface Properties {
		// Allow namespaced CSS Custom Properties
		[index: `--theme-${string}` | `--custom-${string}`]: string | number;
	}
}
