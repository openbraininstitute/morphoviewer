import {
  DEFAULT_SPIKE_AFTERGLOW_IN_SECONDS,
  DEFAULT_SPIKE_SPEED,
  MorphoViewerIconCameraOrtho,
  MorphoViewerIconCameraPersp,
  MorphoViewerSomasOnly,
  type MorphoViewerSomasOnlyProps,
  MorphoViewerSpinner,
} from "@openbraininstitute/morphoviewer";
import {
  useLocalStorageState,
  ViewButton,
  ViewLabel,
  ViewOptions,
  ViewPanel,
  ViewSlider,
} from "@tolokoban/ui";
import React from "react";

import { ScalebarSettings } from "@/components/scalebar-settings";
import { useRandomSpikes } from "@/random-spikes";

import { useCellInfos } from "./hooks";

import styles from "./page.module.css";

export default function Page() {
  const [scalebar, setScalebar] = React.useState<MorphoViewerSomasOnlyProps["scalebar"]>(true);
  const [cameraType, setCameraType] = useLocalStorageState<"orthographic" | "perspective">(
    "orthographic",
    "MorphoViewerSomasOnly/cameraType"
  );
  const [species, setSpecies] = useLocalStorageState("mouse", "MorphoViewerSomasOnly/species");
  const [dataId, setDataId] = useLocalStorageState(
    "c9e10151-8f07-4158-a3b3-205210ceb075",
    "MorphoViewerSomasOnly/dataId"
  );
  // The viewer defaults to black, but the app renders circuits on white, which
  // is the background a spike has to stay legible against.
  const [backgroundColor, setBackgroundColor] = useLocalStorageState(
    "#ffffff",
    "MorphoViewerSomasOnly/backgroundColor"
  );
  const cellInfos = useCellInfos(dataId);
  const [pickedCell, setPickedCell] = React.useState<number | null>(null);
  const spikes = useRandomSpikes(cellInfos?.length ?? 0, 4);
  const [spikePlaying, setSpikePlaying] = React.useState(false);
  const [spikeSpeed, setSpikeSpeed] = React.useState(DEFAULT_SPIKE_SPEED);
  const [spikeAfterglowInSeconds, setSpikeAfterglowInSeconds] = React.useState(
    DEFAULT_SPIKE_AFTERGLOW_IN_SECONDS
  );
  // A ref, not state: the viewer reports the playhead on every painted frame,
  // and re-rendering the page at frame rate would tell us nothing about how the
  // effect looks — least of all on the four-million-soma preset, which is the
  // one worth watching. The readout catches up on the next render.
  const spikeTimeRef = React.useRef(0);
  const [, setSpikeTick] = React.useState(0);
  const handleSpikeTimeChange = React.useCallback((timeInMs: number) => {
    spikeTimeRef.current = timeInMs;
  }, []);
  React.useEffect(() => {
    if (!spikePlaying) return;

    const interval = globalThis.setInterval(() => setSpikeTick((tick) => tick + 1), 100);
    return () => globalThis.clearInterval(interval);
  }, [spikePlaying]);

  return (
    <div className={styles.page}>
      <ViewOptions
        value={dataId}
        onChange={(id) => {
          setDataId(id);
          setPickedCell(null);
        }}
      >
        <div key="c9e10151-8f07-4158-a3b3-205210ceb075">3'684 cells</div>
        <div key="fly">127'400 cells</div>
        <div key="964a878a-c580-4722-b891-1a078ea9aa76">211'712 cells</div>
        <div key="big">4'234'929 cells</div>
      </ViewOptions>
      <div className={styles.viewer}>
        {!cellInfos && <MorphoViewerSpinner label="Circuit" />}
        {cellInfos && (
          <MorphoViewerSomasOnly
            somaRadius={SOMAS_RADII[species] ?? 10}
            cellInfos={cellInfos}
            onMinimize={() => alert("onMinimize()")}
            onClose={() => alert("onClose()")}
            scalebar={scalebar}
            gizmo
            cameraType={cameraType}
            backgroundColor={backgroundColor}
            spikes={spikes}
            spikePlaying={spikePlaying}
            onSpikePlayingChange={setSpikePlaying}
            onSpikeTimeChange={handleSpikeTimeChange}
            spikeSpeed={spikeSpeed}
            spikeAfterglowInSeconds={spikeAfterglowInSeconds}
            onCellClick={setPickedCell}
            controls={[
              <ViewOptions key="species" value={species} onChange={setSpecies}>
                <div key="fly">Fly</div>
                <div key="mouse">Mouse</div>
                <div key="rat">Rat</div>
                <div key="human">Human</div>
                <div key="alien">Alien</div>
              </ViewOptions>,
              <ViewOptions key="camera-type" value={cameraType} onChange={setCameraType}>
                <div key="orthographic">
                  <MorphoViewerIconCameraOrtho />
                </div>
                <div key="perspective">
                  <MorphoViewerIconCameraPersp />
                </div>
              </ViewOptions>,
              "reset-camera",
              "fullscreen",
            ]}
          />
        )}
      </div>
      <ScalebarSettings value={scalebar} onChange={setScalebar} />
      <ViewPanel display="flex" justifyContent="flex-start" alignItems="center" gap="M">
        <ViewButton onClick={() => setSpikePlaying(!spikePlaying)}>
          {spikePlaying ? "Pause" : "Play"} spikes
        </ViewButton>
        <ViewLabel value={`${spikeTimeRef.current.toFixed(0)} ms`} />
        <ViewLabel value={pickedCell === null ? "Click a soma…" : `Cell #${pickedCell}`} />
        <ViewOptions value={`${spikeSpeed}`} onChange={(v) => setSpikeSpeed(Number(v))}>
          <div key="1000">1×</div>
          <div key="100">0.1×</div>
          <div key="10">0.01×</div>
        </ViewOptions>
        <ViewOptions value={backgroundColor} onChange={setBackgroundColor}>
          <div key="#ffffff">White</div>
          <div key="#808080">Grey</div>
          <div key="#000000">Black</div>
        </ViewOptions>
        <ViewLabel value={`Afterglow ${spikeAfterglowInSeconds.toFixed(2)} s`} />
        <ViewSlider
          min={0.05}
          max={2}
          step={0.05}
          value={spikeAfterglowInSeconds}
          onChange={setSpikeAfterglowInSeconds}
        />
      </ViewPanel>
    </div>
  );
}

const SOMAS_RADII = {
  fly: 4,
  mouse: 12,
  rat: 15,
  human: 20,
  alien: 200,
};
