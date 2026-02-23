import { tgdFullscreenToggle } from "@tolokoban/tgd";
import React from "react";
import { classNames } from "@/utils";
import { ButtonResetCamera } from "../button-reset-camera";
import { IconClose } from "../icons/close";
import { IconFullscreen } from "../icons/fullscreen";
import type { MorphoViewerSmallCircuitProps } from ".";
import styles from "./morpho-viewer-small-circuit.module.css";
import type { PainterManager } from "./painter";
import { usePainterManager } from "./painter/manager";

export function MorphoViewerSmallCircuit(props: MorphoViewerSmallCircuitProps) {
	const ref = React.useRef<HTMLDivElement | null>(null);
	const manager = usePainterManager(props);
	const handleToggleFullscreen = () => {
		const div = ref.current;
		if (!div) return;

		tgdFullscreenToggle(div);
	};

	return (
		<div
			ref={ref}
			className={classNames(props.className, styles.morphoViewerSmallCircuit)}
			style={{
				background: props.backgroundColor ?? "#000",
			}}
		>
			<Canvas painterManager={manager} />
			<header>
				<div />
				<ButtonResetCamera painterManager={manager} />
				<div className={styles.flex}>
					<button type="button" onClick={handleToggleFullscreen}>
						<IconFullscreen />
					</button>
					{props.onClose && (
						<button type="button" onClick={props.onClose}>
							<IconClose />
						</button>
					)}
				</div>
			</header>
		</div>
	);
}

const Canvas = React.memo(
	({ painterManager }: { painterManager: PainterManager }) => {
		return (
			<canvas
				key="canvas"
				ref={(canvas: HTMLCanvasElement | null) => {
					painterManager.canvas = canvas;
					return () => {
						painterManager.canvas = null;
					};
				}}
			/>
		);
	},
);
