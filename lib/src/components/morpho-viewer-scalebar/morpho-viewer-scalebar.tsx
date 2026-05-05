import React from "react";

import { classNames } from "@/utils";

import styles from "./morpho-viewer-scalebar.module.css";
import { paint } from "./painter";

export interface MorphoViewerScalebarProps {
	className?: string;
	spacePerPixel: number;
	color?: string;
}

export default function MorphoViewerScalebar({
	className,
	spacePerPixel,
	color,
}: MorphoViewerScalebarProps) {
	const ref = React.useRef<HTMLCanvasElement | null>(null);
	React.useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;

		paint(canvas, spacePerPixel, color);
	}, [spacePerPixel, color]);
	React.useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;

		const observer = new ResizeObserver(() => {
			canvas.width = canvas.clientWidth;
			canvas.height = canvas.clientHeight;
			paint(canvas, spacePerPixel, color);
		});
		observer.observe(canvas);
		return () => observer.unobserve(canvas);
	}, []);

	return (
		<canvas
			ref={ref}
			className={classNames(
				className ?? styles.defaultLayout,
				styles.morphoViewerScalebar,
			)}
		></canvas>
	);
}
