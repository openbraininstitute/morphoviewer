import { tgdFullscreenToggle } from "@tolokoban/tgd";
import React from "react";

import { classNames } from "@/utils";

import { ButtonCameraReset } from "../button-reset-camera";
import { IconClose } from "../icons/close";
import { IconFullscreen } from "../icons/fullscreen";
import { usePainterManager } from "./painter/manager";

import type { MorphoViewerSmallCircuitProps } from ".";
import type { PainterManager } from "./painter";

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
        <ButtonCameraReset painterManager={manager} />
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

const Canvas = React.memo(({ painterManager }: { painterManager: PainterManager }) => {
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
});
