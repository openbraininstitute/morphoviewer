import { tgdFullscreenToggle } from "@tolokoban/tgd";
import React from "react";

import { version } from "@/package.json";
import { classNames } from "@/utils";

import { type ControlAction, ControlsLayout } from "../controls-layout";
import MorphoViewerScalebar from "../morpho-viewer-scalebar";
import { type PainterManager, useManager as usePainterManager } from "./manager";

import type { MorphoViewerSomasOnlyProps } from "./types";

import styles from "./morpho-viewer-somas-only.module.css";

export function MorphoViewerSomasOnly(props: MorphoViewerSomasOnlyProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const painterManager = usePainterManager(props);
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
        painterManager.cameraReset({ zoom: 1 });
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
      className={classNames(props.className, styles.morphoViewerSomasOnly)}
      data-version={version}
    >
      <Canvas painterManager={painterManager} />
      <ControlsLayout
        content={props.controls ?? getDefaultControls(props)}
        onClick={handleControls}
      />
      {props.scalebar && (
        <MorphoViewerScalebar
          className={props.scalebar}
          spacePerPixelEvent={painterManager.eventScalebar}
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

function getDefaultControls(props: MorphoViewerSomasOnlyProps) {
  return ["reset-camera", ["fullscreen", props.onClose && "close", props.onMinimize && "minimize"]];
}
