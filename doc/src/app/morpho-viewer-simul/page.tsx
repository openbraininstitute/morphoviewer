import {
    type MorphoViewerElectrodeInjection,
    type MorphoViewerElectrodeRecording,
    MorphoViewerSimul,
} from "@bbp/morphoviewer";
import AtomicState from "@tolokoban/react-state";
import { isType } from "@tolokoban/type-guards";
import {
    IconDelete,
    ViewButton,
    ViewInputNumber,
    ViewPanel,
    ViewSpinner,
} from "@tolokoban/ui";

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
const injectionState = new AtomicState<
    MorphoViewerElectrodeInjection | undefined
>(undefined, {
    storage: {
        id: "MorphoViewerElectrodeInjection",
        guard: isMorphoViewerElectrodeInjection,
    },
});

export default function Page() {
    const [recordings, setRecordings] = recordingsState.useState();
    const tree = useMorphologyTree();
    const [injection, setInjection] = injectionState.useState();

    const handleRemove = (rec: MorphoViewerElectrodeRecording): void => {
        setRecordings(recordings.filter((item) => item !== rec));
    };

    return (
        <div className={styles.page}>
            <div>
                <div className={styles.viewer}>
                    {tree && typeof tree !== "string" && (
                        <MorphoViewerSimul
                            backgroundColor="#000922    "
                            morphology={tree}
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
                <p>You can hover and click the segments.</p>
                {injection && (
                    <ViewPanel
                        margin={["M", 0]}
                        padding={"M"}
                        backColor="neutral-1"
                    >
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
                                            recordings.map((
                                                item,
                                            ) => (item === rec
                                                ? { ...item, offset }
                                                : item)
                                            ),
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

function isMorphoViewerElectrodeInjection(
    data: unknown,
): data is MorphoViewerElectrodeInjection {
    return isType(data, {
        inject_to: "string",
        current: ["?", "number"],
    });
}
