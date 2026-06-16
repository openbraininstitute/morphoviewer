import { tgdFullscreenToggle } from "@tolokoban/tgd";
import React from "react";

import { useDebugMode } from "@/utils";

import { ButtonCameraReset } from "../button-reset-camera";
import { MorphoViewerIconClose } from "../icons/close";
import { MorphoViewerIconCopy } from "../icons/copy";
import { MorphoViewerIconFullscreen } from "../icons/fullscreen";
import { MorphoViewerIconMinimize } from "../icons/minimize";
import AddRecordingDialog from "./components/add-recording-dialog";
import { HintPanel } from "./components/hint";
import LegendOverlay from "./components/legend-overlay";
import ModeSelector from "./components/ModeSelector";
import SpikingController from "./components/spiking-controller";
import ZoomSlider from "./components/zoom-slider";
import {
  type PainterManager,
  useWebglNeuronSelector as useMorphoViewerSimul,
  usePainterController,
} from "./painter";

import type { MorphoViewerSimulProps } from "./types/public";

import styles from "./morpho-viewer-simul.module.css";

// eslint-disable-next-line react/display-name
export function MorphoViewerSimul(props: MorphoViewerSimulProps) {
  const painterManager = useMorphoViewerSimul(props);
  const spikingManager = painterManager.useSpikingManager();
  const extraProps = { ...props, painterManager };
  usePainterController(extraProps);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const handleFullscreen = () => {
    void tgdFullscreenToggle(ref.current);
  };
  const debugMode = useDebugMode();
  const handleCopyMorphologyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(props.morphology));
  };

  return (
    <div className={styles.main} ref={ref}>
      <Canvas painterManager={painterManager} />
      <HintPanel painterManager={painterManager} />
      <header>
        <ModeSelector painterManager={painterManager} />
        <ZoomSlider className={styles.zoomSlider} painterManager={painterManager} />
        <ButtonCameraReset painterManager={painterManager} />
        <div className={styles.flex}>
          <button type="button" onClick={handleFullscreen}>
            <MorphoViewerIconFullscreen />
          </button>
          {props.onMinimize && (
            <button type="button" onClick={props.onMinimize}>
              <MorphoViewerIconMinimize />
            </button>
          )}
          {props.onClose && (
            <button type="button" onClick={props.onClose}>
              <MorphoViewerIconClose />
            </button>
          )}
        </div>
      </header>
      {debugMode && (
        <footer>
          <button type="button" onClick={handleCopyMorphologyToClipboard}>
            <MorphoViewerIconCopy />
          </button>
        </footer>
      )}
      {spikingManager && <SpikingController spikingManager={spikingManager} />}
      <LegendOverlay {...extraProps} />
      <AddRecordingDialog {...extraProps} />
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
