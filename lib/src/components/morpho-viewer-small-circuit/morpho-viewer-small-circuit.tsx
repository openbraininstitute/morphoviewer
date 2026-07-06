import { tgdFullscreenToggle } from "@tolokoban/tgd";
import React from "react";

import { version } from "@/index";
import { classNames } from "@/utils";

import { type ControlAction, ControlsLayout } from "../controls-layout";
import MorphoViewerScalebar from "../morpho-viewer-scalebar";
import { type PainterManager, usePainterManager } from "./painter";

import type { MorphoViewerSmallCircuitProps } from ".";

import styles from "./morpho-viewer-small-circuit.module.css";

/**
 * @example
 * ```
 * export function MyViewer() {
 *   const [selectedCells, setSelectedCells] = React.useState<string[]>([]);
 *   const [highlightedCellId, setHighlightedCellId] = React.useState('');
 *   const highlightedCellIds = React.useMemo(
 *     () => [...selectedCells, highlightedCellId],
 *     [selectedCells, highlightedCellId]
 *   );
 *   const handleCellHover = (cell: MorphoViewerSmallCircuitCell | undefined): void => {
 *     setHighlightedCellId(cell?.id ?? '');
 *   };
 *   const handleCellClick = (cell: MorphoViewerSmallCircuitCell | undefined): void => {
 *     if (!cell) return;
 *
 *     if (selectedCells.includes(cell.id)) {
 *       setSelectedCells(selectedCells.filter((id) => id !== cell.id));
 *     } else {
 *       setSelectedCells([...selectedCells, cell.id]);
 *     }
 *   };
 *
 *   return (
 *     <MorphoViewerSmallCircuit
 *       className={styles.viewer}
 *       backgroundColor="#000"
 *       circuit={CIRCUIT}
 *       loadCell={loadCell}
 *       onCellHover={handleCellHover}
 *       onCellClick={handleCellClick}
 *       highlightedCellIds={highlightedCellIds}
 *     />
 *   );
 * }
 * ```
 */
export function MorphoViewerSmallCircuit(props: MorphoViewerSmallCircuitProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const manager = usePainterManager(props);
  const handleToggleFullscreen = () => {
    const div = ref.current;
    if (!div) return;

    tgdFullscreenToggle(div);
  };
  const handleControls = (action: ControlAction): void => {
    switch (action) {
      case "fullscreen":
        handleToggleFullscreen();
        break;
      case "reset-camera":
        manager.cameraReset();
        break;
      case "close":
        props.onClose?.();
        break;
      case "minimize":
        props.onMinimize?.();
        break;
    }
  };

  return (
    <div
      ref={ref}
      className={classNames(props.className, styles.morphoViewerSmallCircuit)}
      style={{
        background: props.backgroundColor ?? "#000",
      }}
      data-version={version}
    >
      <Canvas painterManager={manager} />
      <ControlsLayout
        content={props.controls ?? getDefaultControls(props)}
        onClick={handleControls}
      />
      {props.scalebar && (
        <MorphoViewerScalebar
          className={props.scalebar}
          spacePerPixelEvent={manager.eventScalebar}
          unit={props.scalebar}
        />
      )}
    </div>
  );
}

const Canvas = React.memo(({ painterManager }: { painterManager: PainterManager }) => {
  return (
    <canvas
      key="canvas"
      className={styles.webgl}
      ref={(canvas: HTMLCanvasElement | null) => {
        painterManager.canvas = canvas;
        return () => {
          painterManager.canvas = null;
        };
      }}
    />
  );
});

function getDefaultControls(props: MorphoViewerSmallCircuitProps) {
  return ["reset-camera", ["fullscreen", props.onClose && "close", props.onMinimize && "minimize"]];
}
