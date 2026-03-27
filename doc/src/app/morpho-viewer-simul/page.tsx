import {
  type MorphoViewerElectrodeInjection,
  type MorphoViewerElectrodeRecording,
  MorphoViewerSimul,
  MorphoViewerSpikeRecord,
} from "@bbp/morphoviewer";
import AtomicState from "@tolokoban/react-state";
import { isString, isType } from "@tolokoban/type-guards";
import {
  IconDelete,
  useLocalStorageState,
  ViewButton,
  ViewInputNumber,
  ViewOptions,
  ViewPanel,
  ViewSpinner,
} from "@tolokoban/ui";
import React from "react";
import { SYNAPSES } from "./data";
import { useMorphologyTree, useRandomSpikes } from "./hook";
import styles from "./page.module.css";
import { classNames } from "@/utils";
import { SpikesSettings } from "./_/spikes-settings";

const recordingsState = new AtomicState<MorphoViewerElectrodeRecording[]>(
  [
    {
      section: "soma[0]",
      offset: 0.5,
      color: "#32c14e",
      record_currents: true,
      origin: "recording",
    },
  ],
  {
    storage: {
      id: "MorphoViewerElectrodeRecording[]",
      guard: isMorphoViewerElectrodeRecordingArray,
    },
  },
);
const injectionState = new AtomicState<MorphoViewerElectrodeInjection | undefined>(undefined, {
  storage: {
    id: "MorphoViewerElectrodeInjection",
    guard: isMorphoViewerElectrodeInjection,
  },
});

export default function Page() {
  const [recordings, setRecordings] = recordingsState.useState();
  const [example, setExample] = React.useState("01");
  const tree = useMorphologyTree(example);
  const [injection, setInjection] = injectionState.useState();
  const [spikes, setSpikes] = useLocalStorageState(
    [],
    "MorphoViewerSimul/spikes",
    ensureMorphoViewerSpikeRecordArray,
  );
  const handleRemove = (rec: MorphoViewerElectrodeRecording): void => {
    setRecordings(recordings.filter((item) => item !== rec));
  };
  const [resolution, setResolution] = useLocalStorageState(
    "landscape",
    "MorphoViewerSimul/resolution",
    (data: unknown) =>
      isString(data) && ["landscape", "portrait", "small"].includes(data) ? data : "landscape",
  );

  return (
    <div className={styles.page}>
      <div>
        <ViewOptions value={resolution} onChange={setResolution}>
          <div key="landscape">Landscape</div>
          <div key="portrait">Portrait</div>
          <div key="small">Small</div>
        </ViewOptions>
        <div className={classNames(styles.viewer, styles[resolution])}>
          {tree && typeof tree !== "string" && (
            <MorphoViewerSimul
              backgroundColor="#002077"
              minRadius={2}
              morphology={tree}
              spikes={spikes}
              synapses={SYNAPSES}
              recordings={recordings}
              onRecordingsChange={setRecordings}
              injection={injection}
              onInjectionChange={setInjection}
              onClose={() => alert("Close!")}
            />
          )}
          {tree === undefined && (
            <div className={styles.grid}>
              <ViewSpinner />
            </div>
          )}
          {typeof tree === "string" && (
            <div className={styles.grid}>
              <div className={styles.error}>{tree}</div>
            </div>
          )}
        </div>
      </div>
      <div>
        <h1>&lt;MorphoViewerSimul /&gt;</h1>
        <ViewOptions value={example} onChange={setExample}>
          <div key="01">Cell #1</div>
          <div key="02">Cell #2</div>
          <div key="03">Cell #3</div>
        </ViewOptions>
        <SpikesSettings spikes={spikes} onSpikesChange={setSpikes} />
        <p>You can hover and click the segments.</p>
        {injection && (
          <ViewPanel margin={["M", 0]} padding={"M"} backColor="neutral-1">
            <ViewButton
              variant="elevated"
              icon={IconDelete}
              onClick={() => setInjection(undefined)}
            >
              Remove injection <b>{injection.inject_to}</b>
            </ViewButton>
          </ViewPanel>
        )}
        <div className={styles.recordings}>
          <div>Section</div>
          <div>Offset</div>
          <div />
          {recordings.map((rec) => (
            <>
              <div
                key={`${rec.section}/${rec.offset}/A`}
                className={styles.box}
                style={{
                  background: rec.color ?? "#fff",
                }}
              >
                {rec.section}
              </div>
              <div key={`${rec.section}/${rec.offset}/B`}>
                <ViewInputNumber
                  min={0}
                  max={1}
                  value={rec.offset}
                  onChange={(offset) => {
                    setRecordings(
                      recordings.map((item) => (item === rec ? { ...item, offset } : item)),
                    );
                  }}
                />
              </div>
              <button
                key={`${rec.section}/${rec.offset}/C`}
                type="button"
                onClick={() => handleRemove(rec)}
                style={{ background: rec.color ?? "#fff" }}
              >
                <IconDelete />
              </button>
            </>
          ))}
        </div>
      </div>
    </div>
  );
}

function isMorphoViewerElectrodeRecordingArray(
  data: unknown,
): data is MorphoViewerElectrodeRecording[] {
  return isType(data, [
    "array",
    {
      section: "string",
      offset: "number",
      color: ["?", "string"],
      record_currents: "boolean",
    },
  ]);
}

function isMorphoViewerElectrodeInjection(data: unknown): data is MorphoViewerElectrodeInjection {
  return isType(data, {
    inject_to: "string",
    current: ["?", "number"],
  });
}

function isMorphoViewerSpikeRecordArray(data: unknown): data is MorphoViewerSpikeRecord[] {
  return isType(data, [
    "array",
    {
      label: "string",
      color: "string",
      spikesInSeconds: ["array", "number"],
      timeMinInSeconds: "number",
      timeMaxInSeconds: "number",
    },
  ]);
}

function ensureMorphoViewerSpikeRecordArray(data: unknown): MorphoViewerSpikeRecord[] {
  return isMorphoViewerSpikeRecordArray(data) ? data : [];
}
