import {
  MorphoViewerSmallCircuit,
  type MorphoViewerSmallCircuitCell,
  type MorphoViewerSmallCircuitCellData,
  type MorphoViewerSmallCircuitProps,
  morphoViewerConvertMorphologyIntoTree,
} from "@openbraininstitute/morphoviewer";
import { ViewSpinner } from "@tolokoban/ui";
import React from "react";

import { GizmoSettings } from "@/components/gizmo-settings";

import { useCircuit } from "./data";

import styles from "./page.module.css";

export default function Page() {
  const circuit = useCircuit(20);
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
          controls={[
            <strong key="title">Here is a title</strong>,
            "reset-camera",
            ["fullscreen", "minimize", "close"],
          ]}
          backgroundColor="#000"
          circuit={circuit}
          gizmo={gizmo}
          scalebar
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
      <div>
        <h1>&lt;MorphoViewerSmallCircuit /&gt;</h1>
        <GizmoSettings value={gizmo} onChange={setGizmo} />
      </div>
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
