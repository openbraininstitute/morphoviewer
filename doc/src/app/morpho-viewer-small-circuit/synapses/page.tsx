import {
  MorphoViewerSmallCircuit,
  type MorphoViewerSmallCircuitCell,
  type MorphoViewerSmallCircuitCellData,
  type MorphoViewerSmallCircuitProps,
  type MorphoViewerSomasOnlyProps,
  morphoViewerConvertSwcIntoTree,
} from "@openbraininstitute/morphoviewer";
import { ViewButton, ViewSpinner } from "@tolokoban/ui";
import React from "react";

import { GizmoSettings } from "@/components/gizmo-settings";
import { ScalebarSettings } from "@/components/scalebar-settings";

import { useCircuit } from "./data";
import { useSignals } from "./hooks";

import styles from "./page.module.css";

export default function Page() {
  const signals = useSignals();
  const [scalebar, setScalebar] = React.useState<MorphoViewerSomasOnlyProps["scalebar"]>(true);
  const circuit = useCircuit();
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

  return (
    <div className={styles.page}>
      <div className={styles.viewerContainer}>
        <MorphoViewerSmallCircuit
          className={styles.viewer}
          signals={signals}
          controls={[
            <strong key="title">Colored by sections</strong>,
            <ViewButton key="focus" onClick={() => signals.cameraReset.dispatch({ zoom: 100 })}>
              Focus on soma
            </ViewButton>,
            "reset-camera",
            ["fullscreen", "minimize", "close"],
          ]}
          backgroundColor="#000"
          circuit={circuit}
          gizmo={gizmo}
          scalebar={scalebar}
          loadCell={loadCell}
          onCellHover={handleCellHover}
          onCellClick={handleCellClick}
          highlightedCellIds={highlightedCellIds}
          onLoadProgress={setProgress}
          onMinimize={() => alert("onMinimize()")}
          onClose={() => alert("onClose()")}
        />
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
      <GizmoSettings value={gizmo} onChange={setGizmo} />
      <ScalebarSettings value={scalebar} onChange={setScalebar} />
      <hr />
      <a href="docs/interfaces/MorphoViewerSmallCircuitProps.html" target="docs">
        Detailed documentation of the properties
      </a>
    </div>
  );
}

async function loadCell(id: string): Promise<MorphoViewerSmallCircuitCellData | null> {
  try {
    console.log("loadCell:", id);
    const url = `./${id}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Unable to load ${url}\nError ${resp.status}: ${resp.statusText}`);
    }
    const content = await resp.text();
    return {
      type: "tree",
      data: morphoViewerConvertSwcIntoTree(content, id),
    };
  } catch (error) {
    console.error(`Unable to load cell "${id}":`, error);
    return null;
  }
}
