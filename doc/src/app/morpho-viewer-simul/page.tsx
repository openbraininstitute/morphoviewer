import {
  type MorphoViewerElectrodeInjection,
  type MorphoViewerElectrodeRecording,
  MorphoViewerSimul,
  MorphoViewerSimulCamera,
  MorphoViewerSimulController,
  MorphoViewerSpikeRecord,
  MorphoViewerTreeItem,
} from "@bbp/morphoviewer";
import {
  Morphology,
  MorphologySection,
} from "@bbp/morphoviewer/dist/components/morpho-viewer-simul/types/private";
import AtomicState from "@tolokoban/react-state";
import { isString, isType, isType$ } from "@tolokoban/type-guards";
import {
  IconDelete,
  useLocalStorageState,
  ViewButton,
  ViewInputNumber,
  ViewOptions,
  ViewPanel,
  ViewSpinner,
  ViewSwitch,
} from "@tolokoban/ui";
import React from "react";
import { classNames } from "@/utils";
import { SpikesSettings } from "./_/spikes-settings";
import { SYNAPSES } from "./data";
import { useMorphologyTree } from "./hook";
import styles from "./page.module.css";

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

const MORPHOLOGIES = ["01", "02", "03", "cylindrical", "MEM__rp110125_L5-2_idA__cSTUT_L6_NGC"];

export default function Page() {
  const [showSynapses, setShowSynapses] = useLocalStorageState(
    false,
    "MorphoViewerSimul/showSynapses",
    (v) => (typeof v === "boolean" ? v : false),
  );
  const [camera, setCamera] = useLocalStorageState<MorphoViewerSimulCamera | null>(
    null,
    "MorphoViewerSimul/camera",
    ensureMorphoViewerSimulCamera,
  );
  const [controller, setController] = React.useState<MorphoViewerSimulController | null>(null);
  const [recordings, setRecordings] = recordingsState.useState();
  const [example, setExample] = React.useState("01");
  const [straightCylinders, setStraightCylinders] = React.useState(false);
  const [tree, morphology] = useMorphologyTree(example, straightCylinders);
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
  const [treeSegment, setTreeSegment] = React.useState<MorphoViewerTreeItem | undefined>(undefined);
  const morphoSegment = React.useMemo(
    () => findMorphoSegment(treeSegment, morphology),
    [treeSegment, morphology],
  );
  const [treeSegmentParent, setTreeSegmentParent] = React.useState<
    MorphoViewerTreeItem | undefined
  >(undefined);
  const morphoSegmentParent = React.useMemo(
    () => findMorphoSegment(treeSegmentParent, morphology),
    [treeSegmentParent, morphology],
  );
  const handleSegmentClick = (item: {
    segment: MorphoViewerTreeItem;
    parent?: MorphoViewerTreeItem | undefined;
  }): void => {
    setTreeSegment(item.segment);
    setTreeSegmentParent(item.parent);
  };
  const [spikeProgress, setSpikeProgress] = React.useState(0);
  const [spikePlaying, setSpikePlaying] = React.useState(false);

  return (
    <div className={styles.page}>
      <div>
        <ViewPanel
          display="flex"
          gap="S"
          alignItems="center"
          margin={[0, 0, "M", 0]}
          flexWrap="wrap"
        >
          <ViewOptions value={resolution} onChange={setResolution}>
            <div key="landscape">Landscape</div>
            <div key="portrait">Portrait</div>
            <div key="small">Small</div>
          </ViewOptions>
          <ViewSwitch value={straightCylinders} onChange={setStraightCylinders}>
            Use straight cylinders
          </ViewSwitch>
          <ViewButton
            enabled={!!controller}
            onClick={() => {
              if (!controller) return;

              setCamera(controller.cameraGet());
            }}
          >
            Save camera
          </ViewButton>
          <ViewButton
            enabled={!!controller && !!camera}
            onClick={() => {
              if (!camera) return;

              controller?.cameraSet(camera);
            }}
          >
            Load camera
          </ViewButton>
        </ViewPanel>
        <div className={classNames(styles.viewer, styles[resolution])}>
          {tree && typeof tree !== "string" && (
            <MorphoViewerSimul
              backgroundColor="#002077"
              minRadius={2}
              morphology={tree}
              spikes={spikes}
              spikeProgress={spikeProgress}
              onSpikeProgressChange={setSpikeProgress}
              spikePlaying={spikePlaying}
              onSpikePlayingChange={setSpikePlaying}
              synapses={showSynapses ? SYNAPSES : undefined}
              onSegmentClick={handleSegmentClick}
              recordings={recordings}
              onRecordingsChange={setRecordings}
              injection={injection}
              onInjectionChange={setInjection}
              onClose={() => alert("Close!")}
              onReady={setController}
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
        <ViewPanel display="flex" gap="M" alignItems="flex-start">
          {treeSegment && (
            <details>
              <summary>
                <strong>
                  {treeSegment.sectionId}[{treeSegment.segmentId}]
                </strong>{" "}
                <small>(segment)</small>: {(treeSegment.radius * 2).toFixed(3)}
              </summary>
              <pre>{JSON.stringify(removeChildren(treeSegment), null, 2)}</pre>
              <hr />
              BlueNAAS data:
              <br />
              <pre>{JSON.stringify(morphoSegment, null, 2)}</pre>
            </details>
          )}
          {treeSegmentParent && (
            <details>
              <summary>
                <strong>
                  {treeSegmentParent.sectionId}[{treeSegmentParent.segmentId}]
                </strong>{" "}
                <small>(parent)</small>: {(treeSegmentParent.radius * 2).toFixed(3)}
              </summary>
              <pre>{JSON.stringify(removeChildren(treeSegmentParent), null, 2)}</pre>
              <hr />
              BlueNAAS data:
              <br />
              <pre>{JSON.stringify(morphoSegmentParent, null, 2)}</pre>
            </details>
          )}
        </ViewPanel>
      </div>
      <div>
        <h1>&lt;MorphoViewerSimul /&gt;</h1>
        <ViewOptions value={example} onChange={setExample}>
          {MORPHOLOGIES.map((key) => (
            <div key={key}>{key}</div>
          ))}
        </ViewOptions>
        <ViewSwitch value={showSynapses} onChange={setShowSynapses}>
          Show synapses
        </ViewSwitch>
        <SpikesSettings
          spikes={spikes}
          onSpikesChange={setSpikes}
          spikeProgress={spikeProgress}
          onSpikeProgressChange={setSpikeProgress}
          spikePlaying={spikePlaying}
          onSpikePlayingChange={setSpikePlaying}
        />
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

function ensureMorphoViewerSimulCamera(data: unknown): MorphoViewerSimulCamera | null {
  return isType$<MorphoViewerSimulCamera>(data, {
    zoom: "number",
    center: ["array", "number", { min: 3, max: 3 }],
    orientation: ["array", "number", { min: 4, max: 4 }],
  })
    ? data
    : null;
}

function findMorphoSegment(
  item: MorphoViewerTreeItem | undefined,
  morphology: Morphology | undefined,
): MorphologySection | undefined {
  if (!item || !morphology) return undefined;

  return morphology[item.sectionId];
}

function removeChildren(treeSegment: MorphoViewerTreeItem) {
  const copy = structuredClone(treeSegment) as unknown as Omit<MorphoViewerTreeItem, "children"> & {
    children?: number;
  };
  delete copy.children;
  copy.children = treeSegment.children?.length ?? 0;
  return copy;
}
