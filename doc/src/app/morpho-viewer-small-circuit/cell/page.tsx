import {
  DEFAULT_SPIKE_AFTERGLOW_IN_SECONDS,
  DEFAULT_SPIKE_SPEED,
  MorphoViewerSmallCircuit,
  type MorphoViewerSmallCircuitCell,
  type MorphoViewerSmallCircuitCellData,
  type MorphoViewerSmallCircuitProps,
  type MorphoViewerSpikes,
  type MorphoViewerSomasOnlyProps,
  morphoViewerConvertMorphologyIntoTree,
} from "@openbraininstitute/morphoviewer";
import {
  ViewButton,
  ViewLabel,
  ViewOptions,
  ViewPanel,
  ViewSlider,
  ViewSpinner,
  ViewSwitch,
} from "@tolokoban/ui";
import React from "react";

import { GizmoSettings } from "@/components/gizmo-settings";
import { ScalebarSettings } from "@/components/scalebar-settings";

import { useCircuit } from "./data";

import styles from "./page.module.css";

export default function Page() {
  const [scalebar, setScalebar] = React.useState<MorphoViewerSomasOnlyProps["scalebar"]>(true);
  const [showComponent, setShowComponent] = React.useState(true);
  const [circuitId, setCircuitId] = React.useState("small");
  const circuit = useCircuit(circuitId);
  const [gizmo, setGizmo] = React.useState<boolean | MorphoViewerSmallCircuitProps["gizmo"]>(true);
  const [progress, setProgress] = React.useState(0);
  const [selectedCells, setSelectedCells] = React.useState<string[]>([]);
  const [highlightedCellId, setHighlightedCellId] = React.useState("");
  const highlightedCellIds = React.useMemo(
    () => [...selectedCells, highlightedCellId],
    [selectedCells, highlightedCellId]
  );
  const handleCellHover = (cell: MorphoViewerSmallCircuitCell | undefined): void => {
    setHighlightedCellId(cell?.id ?? "");
  };
  const handleCellClick = (cell: MorphoViewerSmallCircuitCell | undefined): void => {
    if (!cell) return;

    if (selectedCells.includes(cell.id)) {
      setSelectedCells(selectedCells.filter((id) => id !== cell.id));
    } else {
      setSelectedCells([...selectedCells, cell.id]);
    }
  };
  const spikes = useRandomSpikes(circuit.length);
  const [spikePlaying, setSpikePlaying] = React.useState(false);
  const [spikeSpeed, setSpikeSpeed] = React.useState(DEFAULT_SPIKE_SPEED);
  const [spikeAfterglowInSeconds, setSpikeAfterglowInSeconds] = React.useState(
    DEFAULT_SPIKE_AFTERGLOW_IN_SECONDS
  );
  // A ref, not state: the viewer reports the playhead on every painted frame,
  // and re-rendering the page at frame rate would tell us nothing about how the
  // effect looks. The readout catches up on the next render.
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
      <ViewPanel display="flex" justifyContent="flex-start" alignItems="center" gap="M">
        <ViewLabel value="Show viewer" />
        <ViewSwitch value={showComponent} onChange={setShowComponent} />
      </ViewPanel>
      <div className={styles.viewerContainer}>
        {!showComponent && (
          <div className={[styles.unmounted, styles.viewer].join(" ")}>
            <div>Viewer has been unmounted...</div>
          </div>
        )}
        {showComponent && (
          <MorphoViewerSmallCircuit
            className={styles.viewer}
            controls={[
              <ViewOptions value={circuitId} onChange={setCircuitId} key="type">
                <div key="small">Small</div>
                <div key="big">Big</div>
              </ViewOptions>,
              "reset-camera",
              ["fullscreen", "minimize", "close"],
            ]}
            backgroundColor="#444"
            circuit={circuit}
            gizmo={gizmo}
            scalebar={scalebar}
            loadCell={loadCell}
            onCellHover={handleCellHover}
            onCellClick={handleCellClick}
            highlightedCellIds={highlightedCellIds}
            spikes={spikes}
            spikePlaying={spikePlaying}
            onSpikePlayingChange={setSpikePlaying}
            onSpikeTimeChange={handleSpikeTimeChange}
            spikeSpeed={spikeSpeed}
            spikeAfterglowInSeconds={spikeAfterglowInSeconds}
            onLoadProgress={setProgress}
            onMinimize={() => alert("onMinimize()")}
            onClose={() => alert("onClose()")}
          />
        )}
        {progress < 1 && (
          <div className={styles.progress}>
            <div>
              <ViewSpinner />
              <div>Loading morphologies... </div>
              <strong>{(100 * progress).toFixed(0)} %</strong>
            </div>{" "}
          </div>
        )}
      </div>
      <div>
        <h1>&lt;MorphoViewerSmallCircuit /&gt;</h1>
        <GizmoSettings value={gizmo} onChange={setGizmo} />
      </div>
      <ScalebarSettings value={scalebar} onChange={setScalebar} />
      <ViewPanel display="flex" justifyContent="flex-start" alignItems="center" gap="M">
        <ViewButton onClick={() => setSpikePlaying(!spikePlaying)}>
          {spikePlaying ? "Pause" : "Play"} spikes
        </ViewButton>
        <ViewLabel value={`${spikeTimeRef.current.toFixed(0)} ms`} />
        <ViewOptions value={`${spikeSpeed}`} onChange={(v) => setSpikeSpeed(Number(v))}>
          <div key="1000">1×</div>
          <div key="100">0.1×</div>
          <div key="10">0.01×</div>
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
      <hr />
      <a href="docs/interfaces/MorphoViewerSmallCircuitProps.html" target="docs">
        Detailed documentation of the properties
      </a>
    </div>
  );
}

/** One second of Poisson firing across the circuit, for tuning the glow by eye. */
function useRandomSpikes(cellCount: number): MorphoViewerSpikes | undefined {
  return React.useMemo(() => {
    if (cellCount === 0) return undefined;

    const timeMaxInMs = 1000;
    const spikesPerCell = 12;
    const count = cellCount * spikesPerCell;
    const cellIndices = new Uint32Array(count);
    const times = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      cellIndices[i] = Math.floor(Math.random() * cellCount);
      times[i] = Math.random() * timeMaxInMs;
    }
    // The viewer binary-searches this, so it has to be sorted — and the two
    // arrays have to stay lined up, which a sort of one of them alone would not.
    const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => times[a] - times[b]);
    return {
      cellIndices: Uint32Array.from(order, (i) => cellIndices[i]),
      times: Float32Array.from(order, (i) => times[i]),
      timeMinInMs: 0,
      timeMaxInMs,
    };
  }, [cellCount]);
}

async function loadCell(id: string): Promise<MorphoViewerSmallCircuitCellData | null> {
  try {
    console.log("loadCell:", id);
    const url = `./assets/${id}.json`;
    const resp = await throttling(fetch(url), 10, 5);
    if (!resp.ok) {
      console.error(`Unable to load ${url}\nError ${resp.status}: ${resp.statusText}`);
    }
    const content = await resp.text();
    const morphology = JSON.parse(content);
    return {
      type: "tree",
      data: morphoViewerConvertMorphologyIntoTree(morphology, id),
    };
  } catch (error) {
    console.error(`Unable to load cell "${id}":`, error);
    return null;
  }
}

async function throttling<T>(promise: Promise<T>, delay: number, min: number): Promise<T> {
  const sleep = new Promise((resolve) => {
    globalThis.setTimeout(resolve, min + Math.random() * delay);
  });
  const [result] = await Promise.all([promise, sleep]);
  return result;
}
