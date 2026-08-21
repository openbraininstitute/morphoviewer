import { tgdFullscreenToggle } from "@tolokoban/tgd";
import React from "react";

import { version } from "@/package.json";
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
  // The watcher only fires on a change, so a scalebar shown again needs telling.
  React.useEffect(() => {
    if (props.scalebar) manager.refreshScalebar();
  }, [props.scalebar, manager]);
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
        manager.cameraReset({ zoom: 1 });
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
      {props.gizmo ? (
        <GizmoCanvas
          painterManager={manager}
          options={props.gizmo}
          // The gizmo turns the same camera, so it follows the dendrogram rotation lock.
          interactive={!props.dendrogram}
        />
      ) : null}
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
    <>
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
      {/* Electrodes only — pointer-events none; picking stays on the circuit canvas. */}
      <canvas
        key="overlays"
        className={styles.webglOverlays}
        ref={(canvas: HTMLCanvasElement | null) => {
          painterManager.overlayCanvas = canvas;
          return () => {
            painterManager.overlayCanvas = null;
          };
        }}
      />
    </>
  );
});

/** The gizmo's own canvas, sized and placed in CSS. */
const GizmoCanvas = React.memo(
  ({
    painterManager,
    options,
    interactive,
  }: {
    painterManager: PainterManager;
    options: NonNullable<MorphoViewerSmallCircuitProps["gizmo"]>;
    interactive: boolean;
  }) => {
    const { alignX, alignY, size, margin } = normalizeGizmo(options);
    // The style props change often. An inline ref would detach on every render, and
    // re-attaching rebuilds the gizmo context, which blanks the gizmo for a moment.
    const ref = React.useCallback(
      (canvas: HTMLCanvasElement | null) => {
        painterManager.gizmoCanvas = canvas;
        return () => {
          painterManager.gizmoCanvas = null;
        };
      },
      [painterManager]
    );
    return (
      <canvas
        className={styles.gizmo}
        style={{
          width: size,
          height: size,
          ...(alignX < 0 ? { left: margin } : { right: margin }),
          ...(alignY > 0 ? { top: margin } : { bottom: margin }),
          pointerEvents: interactive ? "auto" : "none",
        }}
        ref={ref}
      />
    );
  }
);

const DEFAULT_GIZMO = { alignX: +1, alignY: -1, size: 96, margin: 10 };

function normalizeGizmo(options: NonNullable<MorphoViewerSmallCircuitProps["gizmo"]>) {
  return typeof options === "boolean" ? DEFAULT_GIZMO : { ...DEFAULT_GIZMO, ...options };
}

function getDefaultControls(props: MorphoViewerSmallCircuitProps) {
  return ["reset-camera", ["fullscreen", props.onClose && "close", props.onMinimize && "minimize"]];
}
