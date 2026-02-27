import {
  MorphoViewerSmallCircuit,
  type MorphoViewerSmallCircuitCell,
  type MorphoViewerSmallCircuitCellData,
  morphoViewerConvertMorphologyIntoTree,
} from "@bbp/morphoviewer";
import React from "react";

import { useCircuit } from "./data";

import styles from "./page.module.css";

export default function Page() {
  const circuit = useCircuit();
  console.log("🐞 [page@15] circuit =", circuit); // @FIXME: Remove this line written on 2026-02-27 at 14:31
  const [selectedCells, setSelectedCells] = React.useState<string[]>([]);
  const [highlightedCellId, setHighlightedCellId] = React.useState("");
  const highlightedCellIds = React.useMemo(
    () => [...selectedCells, highlightedCellId],
    [selectedCells, highlightedCellId],
  );
  const handleCellHover = (
    cell: MorphoViewerSmallCircuitCell | undefined,
  ): void => {
    setHighlightedCellId(cell?.id ?? "");
  };
  const handleCellClick = (
    cell: MorphoViewerSmallCircuitCell | undefined,
  ): void => {
    if (!cell) return;

    if (selectedCells.includes(cell.id)) {
      setSelectedCells(selectedCells.filter((id) => id !== cell.id));
    } else {
      setSelectedCells([...selectedCells, cell.id]);
    }
  };

  return (
    <div className={styles.page}>
      <div>
        <MorphoViewerSmallCircuit
          className={styles.viewer}
          backgroundColor="#000"
          circuit={circuit}
          loadCell={loadCell}
          onCellHover={handleCellHover}
          onCellClick={handleCellClick}
          highlightedCellIds={highlightedCellIds}
        />
      </div>
      <div>
        <h1>&lt;MorphoViewerSmallCircuit /&gt;</h1>
      </div>
    </div>
  );
}

async function loadCell(
  id: string,
): Promise<MorphoViewerSmallCircuitCellData | null> {
  try {
    console.log("loadCell:", id);
    const url = `./assets/${id}.json`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(
        `Unable to load ${url}\nError ${resp.status}: ${resp.statusText}`,
      );
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
